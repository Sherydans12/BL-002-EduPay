import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChargeStatus, CommunicationType, DeliveryStatus, Prisma } from '@prisma/client';
import { tenantContext } from '../core/tenant/tenant.context';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { FindSentCommunicationsQueryDto } from './dto/find-sent-communications-query.dto';
import { LogCommunicationDto } from './dto/log-communication.dto';
import { SendCustomCommunicationDto } from './dto/send-custom-communication.dto';
import { UpdateTenantEmailConfigDto } from './dto/update-tenant-email-config.dto';

type SentCommunicationFilters = Pick<
  FindSentCommunicationsQueryDto,
  'search' | 'status' | 'type'
>;

type CommunicationMetadata = {
  amount?: number;
  boletaNumber?: string;
  boletaUrl?: string;
  conceptName?: string;
  dueDate?: string;
  paymentDate?: string;
  paymentGroupId?: number;
  studentId?: number;
  studentName?: string;
};

type DeliveryUpdate = {
  status: DeliveryStatus;
  resendEmailId?: string | null;
  errorMessage?: string | null;
};

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
  ) {}

  logCommunication(data: LogCommunicationDto) {
    const tenantId = this.getCurrentTenantId();

    return this.prisma.sentCommunication.create({
      data: {
        tenantId,
        recipientEmail: data.recipientEmail.trim(),
        recipientName: data.recipientName?.trim() || null,
        type: data.type,
        subject: data.subject,
        status: data.status,
        resendEmailId: data.resendEmailId ?? null,
        metadata: data.metadata,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  async getSentCommunications(
    page = 1,
    limit = 20,
    filters: SentCommunicationFilters = {},
  ) {
    const tenantId = this.getCurrentTenantId();
    const normalizedSearch = filters.search?.trim();
    const where: Prisma.SentCommunicationWhereInput = {
      tenantId,
      ...(normalizedSearch
        ? {
            OR: [
              {
                recipientEmail: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                recipientName: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                subject: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.sentCommunication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sentCommunication.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCommunicationStats() {
    const tenantId = this.getCurrentTenantId();
    const now = new Date();

    const [
      totalSent,
      deliveredCount,
      bouncedCount,
      failedCount,
      sentViaResendCount,
      overdueCharges,
    ] = await Promise.all([
      this.prisma.sentCommunication.count({ where: { tenantId } }),
      this.prisma.sentCommunication.count({
        where: { tenantId, status: DeliveryStatus.DELIVERED },
      }),
      this.prisma.sentCommunication.count({
        where: { tenantId, status: DeliveryStatus.BOUNCED },
      }),
      this.prisma.sentCommunication.count({
        where: {
          tenantId,
          status: { in: [DeliveryStatus.FAILED, DeliveryStatus.COMPLAINED] },
        },
      }),
      this.prisma.sentCommunication.count({
        where: { tenantId, status: DeliveryStatus.SENT },
      }),
      this.prisma.charge.findMany({
        where: {
          deletedAt: null,
          status: {
            in: [
              ChargeStatus.PENDING,
              ChargeStatus.PARTIALLY_PAID,
              ChargeStatus.OVERDUE,
            ],
          },
          dueDate: { lte: now },
          student: {
            deletedAt: null,
            guardian: {
              deletedAt: null,
              email: { not: null },
            },
          },
        },
        select: {
          amount: true,
          paidAmount: true,
          studentId: true,
        },
      }),
    ]);

    const totalOverdueAmount = overdueCharges.reduce(
      (acc, c) => acc + Math.max(c.amount - c.paidAmount, 0),
      0,
    );
    const uniqueStudentsWithOverdue = new Set(
      overdueCharges.map((c) => c.studentId),
    ).size;

    const deliveryRate =
      totalSent > 0 ? Math.round((deliveredCount / totalSent) * 100) : 100;

    return {
      totalSent,
      deliveredCount,
      bouncedCount,
      failedCount,
      sentViaResendCount,
      deliveryRate,
      pendingRemindersCount: uniqueStudentsWithOverdue,
      totalOverdueAmount,
    };
  }

  async sendCustomCommunication(dto: SendCustomCommunicationDto) {
    let studentName: string | undefined;
    let courseName: string | undefined;

    if (dto.studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, deletedAt: null },
        include: { course: true, guardian: true },
      });
      if (student) {
        studentName = student.name;
        courseName = student.course?.name;
      }
    }

    await this.mailService.sendCustomMessage({
      to: dto.recipientEmail.trim(),
      recipientName: dto.recipientName?.trim(),
      studentName,
      studentId: dto.studentId,
      courseName,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
    });

    return {
      success: true,
      message: 'Comunicación enviada exitosamente',
    };
  }

  getEmailSettings() {
    const tenantId = this.getCurrentTenantId();

    return this.prisma.tenantEmailConfig.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  updateEmailSettings(dto: UpdateTenantEmailConfigDto) {
    const tenantId = this.getCurrentTenantId();
    const data = this.buildEmailSettingsData(dto);

    return this.prisma.tenantEmailConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  /**
   * Actualiza un registro que ya fue correlacionado con Resend. Este método no
   * obtiene el tenant del contexto porque también lo usa el webhook público.
   */
  updateDelivery(id: string, data: DeliveryUpdate) {
    return this.prisma.sentCommunication.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.resendEmailId !== undefined
          ? { resendEmailId: data.resendEmailId }
          : {}),
        ...(data.errorMessage !== undefined
          ? { errorMessage: data.errorMessage }
          : {}),
      },
    });
  }

  async retryCommunication(id: string) {
    const tenantId = this.getCurrentTenantId();
    const communication = await this.prisma.sentCommunication.findFirst({
      where: { id, tenantId },
    });

    if (!communication) {
      throw new NotFoundException('La comunicación no existe');
    }

    if (
      communication.status !== DeliveryStatus.FAILED &&
      communication.status !== DeliveryStatus.BOUNCED
    ) {
      throw new BadRequestException(
        'Solo se pueden reintentar comunicaciones fallidas o rebotadas',
      );
    }

    const metadata = this.readMetadata(communication.metadata);
    const student = await this.findStudentForRetry(metadata.studentId);
    const recipientName = communication.recipientName ?? student.guardian.name;
    const studentName = metadata.studentName ?? student.name;

    switch (communication.type) {
      case CommunicationType.BOLETA_EMITTED: {
        const paymentGroupId = this.requiredNumber(
          metadata.paymentGroupId,
          'paymentGroupId',
        );
        const boletaFileUrl = this.requiredString(
          metadata.boletaUrl,
          'boletaUrl',
        );

        await this.mailService.sendBoletaNotification({
          to: communication.recipientEmail,
          recipientName,
          studentName,
          studentId: student.id,
          paymentGroupId,
          boletaNumber: metadata.boletaNumber,
          boletaFileUrl,
          trackingCommunicationId: communication.id,
        });
        break;
      }
      case CommunicationType.MANUAL_PAYMENT_RECEIPT: {
        const paymentDateValue = this.requiredString(
          metadata.paymentDate,
          'paymentDate',
        );
        const paymentDate = new Date(paymentDateValue);
        if (Number.isNaN(paymentDate.getTime())) {
          throw new BadRequestException('paymentDate no es una fecha válida');
        }

        await this.mailService.sendPaymentConfirmation({
          to: communication.recipientEmail,
          recipientName,
          studentName,
          studentId: student.id,
          paymentGroupId: metadata.paymentGroupId,
          amount: this.requiredNumber(metadata.amount, 'amount'),
          paymentDate,
          boletaFileUrl: metadata.boletaUrl,
          trackingCommunicationId: communication.id,
        });
        break;
      }
      case CommunicationType.PAYMENT_REMINDER: {
        const dueDate = metadata.dueDate
          ? new Date(metadata.dueDate)
          : undefined;
        if (dueDate && Number.isNaN(dueDate.getTime())) {
          throw new BadRequestException('dueDate no es una fecha válida');
        }

        await this.mailService.sendReminder({
          to: communication.recipientEmail,
          recipientName,
          studentName,
          studentId: student.id,
          amount: this.requiredNumber(metadata.amount, 'amount'),
          dueDate,
          conceptName: metadata.conceptName,
          trackingCommunicationId: communication.id,
        });
        break;
      }
      case CommunicationType.ACCOUNT_STATEMENT:
        throw new BadRequestException(
          'El reintento de estados de cuenta aún no está disponible',
        );
      default:
        throw new BadRequestException('Tipo de comunicación no soportado');
    }

    return this.prisma.sentCommunication.findFirstOrThrow({
      where: { id, tenantId },
    });
  }

  private getCurrentTenantId(): string {
    const tenantId = tenantContext.getStore()?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(
        'Debe seleccionar un colegio para consultar comunicaciones',
      );
    }

    return tenantId;
  }

  private readMetadata(
    metadata: Prisma.JsonValue | null,
  ): CommunicationMetadata {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
      return {};
    }

    return metadata as CommunicationMetadata;
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`La metadata no contiene ${field}`);
    }

    return value;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`La metadata no contiene ${field}`);
    }

    return value;
  }

  private async findStudentForRetry(studentId: unknown) {
    const id = this.requiredNumber(studentId, 'studentId');
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: { guardian: true },
    });

    if (!student) {
      throw new NotFoundException('El alumno asociado ya no existe');
    }

    return student;
  }

  private buildEmailSettingsData(dto: UpdateTenantEmailConfigDto) {
    return {
      ...(dto.senderName !== undefined
        ? { senderName: dto.senderName.trim() }
        : {}),
      ...(dto.senderEmail !== undefined
        ? { senderEmail: dto.senderEmail?.trim() || null }
        : {}),
      ...(dto.replyToEmail !== undefined
        ? { replyToEmail: dto.replyToEmail?.trim() || null }
        : {}),
      ...(dto.emailFooter !== undefined
        ? { emailFooter: dto.emailFooter?.trim() || null }
        : {}),
      ...(dto.enableAllEmails !== undefined
        ? { enableAllEmails: dto.enableAllEmails }
        : {}),
      ...(dto.enableManualPaymentEmails !== undefined
        ? { enableManualPaymentEmails: dto.enableManualPaymentEmails }
        : {}),
      ...(dto.enableBoletaEmails !== undefined
        ? { enableBoletaEmails: dto.enableBoletaEmails }
        : {}),
      ...(dto.enableReminderEmails !== undefined
        ? { enableReminderEmails: dto.enableReminderEmails }
        : {}),
    };
  }
}
