import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  logNotification(dto: CreateNotificationDto) {
    const data: Prisma.NotificationLogCreateInput = {
      type: dto.type,
      status: dto.status,
      recipientEmail: dto.recipientEmail,
      subject: dto.subject,
      body: dto.body,
      errorMessage: dto.errorMessage,
      ...(dto.studentId
        ? { student: { connect: { id: dto.studentId } } }
        : {}),
      ...(dto.paymentGroupId
        ? { paymentGroup: { connect: { id: dto.paymentGroupId } } }
        : {}),
    };

    return this.prisma.notificationLog.create({
      data,
      include: { student: true, paymentGroup: true },
    });
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
