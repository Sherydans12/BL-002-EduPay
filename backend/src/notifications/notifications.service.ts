import { Injectable } from '@nestjs/common';
import { NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

type DispatchEmailData = {
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  html: string;
  studentId?: number;
  paymentGroupId?: number;
};

@Injectable()
export class NotificationsService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  constructor(private readonly prisma: PrismaService) {}

  logNotification(dto: CreateNotificationDto) {
    const data: Prisma.NotificationLogCreateInput = {
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
    const recipientEmail = data.recipientEmail?.trim();

    if (
      !recipientEmail ||
      recipientEmail.toLowerCase().includes('@placeholder.com') ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
    ) {
      return this.logNotification({
        type: data.type,
        status: NotificationStatus.FAILED,
        recipientEmail: data.recipientEmail,
        subject: data.subject,
        body: data.html,
        errorMessage:
          'Envío abortado: Correo electrónico es un placeholder o es inválido.',
        studentId: data.studentId,
        paymentGroupId: data.paymentGroupId,
      });
    }

    try {
      const result = await this.resend.emails.send({
        from: 'pagos@colegio.edu.cl',
        to: data.recipientEmail,
        subject: data.subject,
        html: data.html,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return this.logNotification({
        type: data.type,
        status: NotificationStatus.SENT,
        recipientEmail: data.recipientEmail,
        subject: data.subject,
        body: data.html,
        studentId: data.studentId,
        paymentGroupId: data.paymentGroupId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown email dispatch error';

      return this.logNotification({
        type: data.type,
        status: NotificationStatus.FAILED,
        recipientEmail: data.recipientEmail,
        subject: data.subject,
        body: data.html,
        errorMessage,
        studentId: data.studentId,
        paymentGroupId: data.paymentGroupId,
      });
    }
  }

  async findAll(page = 1, limit = 50) {
    const where: Prisma.NotificationLogWhereInput = { deletedAt: null };

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
