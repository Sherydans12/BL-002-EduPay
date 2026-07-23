import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'node:path';
import { Resend } from 'resend';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';

type DispatchEmailData = {
  tenantId?: string;
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  html: string;
  studentId?: number;
  paymentGroupId?: number;
  attachments?: { filename: string; path: string }[];
};

type EmailDeliveryData = Pick<
  DispatchEmailData,
  'recipientEmail' | 'subject' | 'html' | 'attachments'
>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private resend = new Resend(
    process.env.RESEND_API_KEY || 're_placeholder_dev_no_email',
  );
  private isEmailEnabled = !!process.env.RESEND_API_KEY;

  constructor(private readonly prisma: PrismaService) {}

  logNotification(dto: CreateNotificationDto, tenantId?: string) {
    const data: Prisma.NotificationLogCreateInput = {
      ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
      type: dto.type,
      status: dto.status,
      recipientEmail: dto.recipientEmail,
      subject: dto.subject,
      body: dto.body,
      errorMessage: dto.errorMessage,
      ...(dto.studentId ? { student: { connect: { id: dto.studentId } } } : {}),
      ...(dto.paymentGroupId
        ? { paymentGroup: { connect: { id: dto.paymentGroupId } } }
        : {}),
    };

    return this.prisma.notificationLog.create({
      data,
      include: { student: true, paymentGroup: true },
    });
  }

  async dispatchEmail(data: DispatchEmailData) {
    try {
      await this.sendViaProvider(data);

      return this.logNotification(
        {
          type: data.type,
          status: NotificationStatus.SENT,
          recipientEmail: data.recipientEmail,
          subject: data.subject,
          body: data.html,
          studentId: data.studentId,
          paymentGroupId: data.paymentGroupId,
        },
        data.tenantId,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown email dispatch error';

      return this.logNotification(
        {
          type: data.type,
          status: NotificationStatus.FAILED,
          recipientEmail: data.recipientEmail,
          subject: data.subject,
          body: data.html,
          errorMessage,
          studentId: data.studentId,
          paymentGroupId: data.paymentGroupId,
        },
        data.tenantId,
      );
    }
  }

  @Cron('0 */15 * * * *')
  async retryFailedNotifications() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const result = { processed: 0, sent: 0, failed: 0 };

    for (const tenant of tenants) {
      await tenantContext.run(
        { tenantId: tenant.id, isSuperAdmin: false },
        async () => {
          const failedNotifications =
            await this.prisma.notificationLog.findMany({
              where: {
                tenantId: tenant.id,
                status: NotificationStatus.FAILED,
                retryCount: { lt: 3 },
                deletedAt: null,
              },
              include: {
                paymentGroup: {
                  select: { boletaFileUrl: true, boletaNumber: true },
                },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: 100,
            });

          for (const notification of failedNotifications) {
            result.processed += 1;

            try {
              await this.sendViaProvider({
                recipientEmail: notification.recipientEmail,
                subject: notification.subject,
                html: notification.body,
                attachments: this.resolveRetryAttachments(notification),
              });
            } catch (error) {
              const errorMessage = this.toErrorMessage(error);
              await this.prisma.notificationLog.update({
                where: { id: notification.id, tenantId: tenant.id },
                data: {
                  status: NotificationStatus.FAILED,
                  retryCount: { increment: 1 },
                  errorMessage,
                },
              });
              result.failed += 1;
              this.logger.warn({
                event: 'NOTIFICATION_RETRY_FAILED',
                tenantId: tenant.id,
                notificationLogId: notification.id,
                retryCount: notification.retryCount + 1,
                errorMessage,
              });
              continue;
            }

            await this.prisma.notificationLog.update({
              where: { id: notification.id, tenantId: tenant.id },
              data: {
                status: NotificationStatus.SENT,
                errorMessage: null,
              },
            });
            result.sent += 1;
          }
        },
      );
    }

    return result;
  }

  private async sendViaProvider(data: EmailDeliveryData): Promise<void> {
    const recipientEmail = data.recipientEmail?.trim();

    if (
      !recipientEmail ||
      recipientEmail.toLowerCase().includes('@placeholder.com') ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
    ) {
      throw new Error(
        'Envío abortado: Correo electrónico es un placeholder o es inválido.',
      );
    }

    if (!this.isEmailEnabled) {
      throw new Error(
        'Email deshabilitado en entorno local (sin RESEND_API_KEY).',
      );
    }

    const result = await this.resend.emails.send({
      from: 'pagos@colegio.edu.cl',
      to: recipientEmail,
      subject: data.subject,
      html: data.html,
      attachments: data.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: fs.readFileSync(attachment.path),
      })),
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  private resolveRetryAttachments(notification: {
    type: NotificationType;
    paymentGroup: {
      boletaFileUrl: string | null;
      boletaNumber: string | null;
    } | null;
  }): { filename: string; path: string }[] | undefined {
    const boletaFileUrl = notification.paymentGroup?.boletaFileUrl;
    if (
      notification.type !== NotificationType.BOLETA_DELIVERY ||
      !boletaFileUrl
    ) {
      return undefined;
    }

    const attachmentPath = path.resolve(
      process.cwd(),
      boletaFileUrl.replace(/^\/+/, ''),
    );
    const boletaNumber = notification.paymentGroup?.boletaNumber;

    return [
      {
        filename: boletaNumber
          ? `boleta-${boletaNumber}.pdf`
          : path.basename(attachmentPath),
        path: attachmentPath,
      },
    ];
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown email dispatch error';
  }

  async findAll({
    page = 1,
    limit = 50,
    search,
    status,
    type,
  }: FindNotificationsQueryDto = {}) {
    const normalizedSearch = search?.trim();
    const where: Prisma.NotificationLogWhereInput = {
      deletedAt: null,
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
                subject: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { student: true, paymentGroup: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where }),
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
}
