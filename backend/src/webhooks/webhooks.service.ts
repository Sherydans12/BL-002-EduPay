import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  PaymentMethod,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { TransbankWebhookDto } from './dto/transbank-webhook.dto';

type DecodedPaymentIntent = {
  tenantId: string;
  chargeIds: number[];
};

type WebhookProcessResult = {
  received: true;
  approved: boolean;
  alreadyProcessed: boolean;
  buyOrder: string;
  paymentGroupId?: number;
  amount: number;
  paidInstallmentsIds?: number[];
};

const APPROVED_TRANSBANK_STATUSES = new Set(['AUTHORIZED', 'APPROVED', '0']);

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async processTransbankNotification(
    dto: TransbankWebhookDto,
  ): Promise<WebhookProcessResult> {
    const buyOrder = dto.buyOrder.trim();
    const sessionId = dto.sessionId.trim();
    const authorizationCode = dto.authorizationCode.trim();
    const status = String(dto.status).trim().toUpperCase();

    const previousGroup = await this.prisma.paymentGroup.findFirst({
      where: {
        buyOrder,
        deletedAt: null,
        payments: { some: { deletedAt: null } },
      },
      select: {
        id: true,
        totalAmount: true,
        payments: {
          where: { deletedAt: null },
          select: { chargeId: true },
        },
      },
    });

    if (previousGroup) {
      return {
        received: true,
        approved: true,
        alreadyProcessed: true,
        buyOrder,
        paymentGroupId: previousGroup.id,
        amount: previousGroup.totalAmount,
        paidInstallmentsIds: previousGroup.payments
          .map((payment) => payment.chargeId)
          .filter((id): id is number => id !== null)
          .sort((a, b) => a - b),
      };
    }

    const approved = APPROVED_TRANSBANK_STATUSES.has(status);
    if (!approved) {
      return {
        received: true,
        approved: false,
        alreadyProcessed: false,
        buyOrder,
        amount: dto.amount,
      };
    }

    const intent = this.decodePaymentIntent(buyOrder, sessionId);
    if (!intent) {
      throw new BadRequestException(
        'No fue posible resolver tenantId y cuotas desde buyOrder/sessionId',
      );
    }

    return tenantContext.run(
      { tenantId: intent.tenantId, isSuperAdmin: false },
      () =>
        this.prisma.$transaction(async (tx) => {
          const duplicateGroup = await tx.paymentGroup.findFirst({
            where: {
              tenantId: intent.tenantId,
              buyOrder,
              deletedAt: null,
              payments: { some: { deletedAt: null } },
            },
            select: {
              id: true,
              totalAmount: true,
              payments: {
                where: { deletedAt: null },
                select: { chargeId: true },
              },
            },
          });

          if (duplicateGroup) {
            return {
              received: true,
              approved: true,
              alreadyProcessed: true,
              buyOrder,
              paymentGroupId: duplicateGroup.id,
              amount: duplicateGroup.totalAmount,
              paidInstallmentsIds: duplicateGroup.payments
                .map((payment) => payment.chargeId)
                .filter((id): id is number => id !== null)
                .sort((a, b) => a - b),
            };
          }

          const charges = await tx.charge.findMany({
            where: {
              tenantId: intent.tenantId,
              id: { in: intent.chargeIds },
              deletedAt: null,
              student: {
                tenantId: intent.tenantId,
                deletedAt: null,
                guardian: { deletedAt: null },
              },
            },
            include: {
              student: {
                select: {
                  id: true,
                  guardian: { select: { rut: true } },
                },
              },
            },
            orderBy: { id: 'asc' },
          });

          if (charges.length !== intent.chargeIds.length) {
            const foundIds = new Set(charges.map((charge) => charge.id));
            const missingIds = intent.chargeIds.filter(
              (id) => !foundIds.has(id),
            );
            throw new NotFoundException(
              `Cuota(s) no encontrada(s): ${missingIds.join(', ')}`,
            );
          }

          const nonPayable = charges.filter(
            (charge) =>
              charge.status === ChargeStatus.PAID ||
              charge.status === ChargeStatus.CANCELLED ||
              charge.paidAmount >= charge.amount,
          );
          if (nonPayable.length > 0) {
            throw new ConflictException(
              `Cuota(s) no pagable(s): ${nonPayable
                .map((charge) => charge.id)
                .join(', ')}`,
            );
          }

          const expectedAmount = charges.reduce(
            (total, charge) => total + charge.amount - charge.paidAmount,
            0,
          );
          if (expectedAmount !== dto.amount) {
            throw new BadRequestException(
              `El monto informado (${dto.amount}) no coincide con el saldo de las cuotas (${expectedAmount})`,
            );
          }

          const receiptUrl = await this.generateReceiptPdf({
            buyOrder,
            sessionId,
            authorizationCode,
            amount: dto.amount,
            tenantId: intent.tenantId,
            chargeIds: intent.chargeIds,
          });

          const paymentDate = new Date();
          const group = await tx.paymentGroup.create({
            data: {
              tenantId: intent.tenantId,
              buyOrder,
              totalAmount: dto.amount,
              method: PaymentMethod.WEBPAY,
              paymentDate,
              boletaFileUrl: receiptUrl,
              notes: `Webpay authorizationCode=${authorizationCode}; sessionId=${sessionId}`,
              source: PaymentSource.PORTAL,
              isBoletaPending: true,
            },
          });

          for (const charge of charges) {
            const amount = charge.amount - charge.paidAmount;

            await tx.payment.create({
              data: {
                tenantId: intent.tenantId,
                amount,
                method: PaymentMethod.WEBPAY,
                paymentDate,
                studentId: charge.studentId,
                conceptId: charge.conceptId,
                chargeId: charge.id,
                paymentGroupId: group.id,
                payerRut: charge.student.guardian.rut,
                referenceCode: buyOrder,
                notes: `Transbank authorizationCode=${authorizationCode}`,
              },
            });

            await tx.charge.update({
              where: { id: charge.id },
              data: {
                paidAmount: charge.amount,
                status: ChargeStatus.PAID,
              },
            });
          }

          return {
            received: true,
            approved: true,
            alreadyProcessed: false,
            buyOrder,
            paymentGroupId: group.id,
            amount: dto.amount,
            paidInstallmentsIds: charges.map((charge) => charge.id),
          };
        }),
    );
  }

  private decodePaymentIntent(
    buyOrder: string,
    sessionId: string,
  ): DecodedPaymentIntent | null {
    for (const value of [buyOrder, sessionId]) {
      const decodedJson = this.decodeBase64Intent(value);
      if (decodedJson) return decodedJson;

      const delimited = this.decodeDelimitedIntent(value);
      if (delimited) return delimited;
    }

    return null;
  }

  private decodeDelimitedIntent(value: string): DecodedPaymentIntent | null {
    const match = value.match(
      /^(?<tenantId>[a-z0-9][a-z0-9-]{1,80})(?:[:|])(?<ids>\d+(?:,\d+)*)$/i,
    );
    const tenantId = match?.groups?.tenantId;
    const ids = match?.groups?.ids;

    if (!tenantId || !ids) return null;

    return {
      tenantId,
      chargeIds: ids.split(',').map((id) => Number(id)),
    };
  }

  private decodeBase64Intent(value: string): DecodedPaymentIntent | null {
    const payload = value.replace(/^(tbk_|webpay_)/i, '');
    if (!payload || payload === value) return null;

    try {
      const json = Buffer.from(payload, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as {
        tenantId?: unknown;
        chargeIds?: unknown;
        installmentsIds?: unknown;
      };
      const ids = Array.isArray(parsed.chargeIds)
        ? parsed.chargeIds
        : parsed.installmentsIds;

      if (
        typeof parsed.tenantId !== 'string' ||
        !Array.isArray(ids) ||
        ids.length === 0
      ) {
        return null;
      }

      const chargeIds = ids.map((id) => Number(id));
      if (!chargeIds.every((id) => Number.isInteger(id) && id > 0)) {
        return null;
      }

      return {
        tenantId: parsed.tenantId,
        chargeIds,
      };
    } catch {
      return null;
    }
  }

  private async generateReceiptPdf(input: {
    buyOrder: string;
    sessionId: string;
    authorizationCode: string;
    amount: number;
    tenantId: string;
    chargeIds: number[];
  }): Promise<string> {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const relativeDir = path.join('webpay-receipts');
    const absoluteDir = path.resolve(process.cwd(), uploadDir, relativeDir);
    await fs.mkdir(absoluteDir, { recursive: true });

    const filename = `${this.toSafeFilename(input.buyOrder)}.pdf`;
    const absolutePath = path.join(absoluteDir, filename);
    const relativeUrl = `/uploads/${relativeDir.replace(/\\/g, '/')}/${filename}`;

    const pdf = this.buildSimpleReceiptPdf([
      'Comprobante de pago Webpay',
      `Orden: ${input.buyOrder}`,
      `Tenant: ${input.tenantId}`,
      `Cuotas: ${input.chargeIds.join(', ')}`,
      `Monto: ${input.amount}`,
      `Codigo autorizacion: ${input.authorizationCode}`,
      `Sesion: ${input.sessionId}`,
      `Fecha: ${new Date().toISOString()}`,
    ]);

    await fs.writeFile(absolutePath, pdf);
    return relativeUrl;
  }

  private buildSimpleReceiptPdf(lines: string[]): Buffer {
    const content = [
      'BT',
      '/F1 12 Tf',
      '72 760 Td',
      ...lines.flatMap((line, index) => [
        index === 0 ? '/F1 16 Tf' : '/F1 12 Tf',
        `(${this.escapePdfText(line)}) Tj`,
        '0 -22 Td',
      ]),
      'ET',
    ].join('\n');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  private escapePdfText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, (match) => `\\${match}`);
  }

  private toSafeFilename(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]/gi, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }
}
