import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(startDate?: string, endDate?: string, courseId?: string) {
    const where: any = {};

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    if (courseId) {
      where.student = {
        courseId: Number(courseId),
      };
    }

    // 1. Total recaudado y conteo de transacciones
    const aggregations = await this.prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    // 2. Subtotales agrupados por m\u00e9todo de pago
    const groupByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      totalCollected: aggregations._sum.amount || 0,
      totalTransactions: aggregations._count.id || 0,
      byMethod: groupByMethod.map(item => ({
        method: item.method,
        total: item._sum.amount || 0,
        count: item._count.id || 0,
      })),
    };
  }
}
