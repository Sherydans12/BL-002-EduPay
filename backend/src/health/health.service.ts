import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = {
  status: 'ok';
  info: {
    database: {
      status: 'up';
    };
  };
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException('Database health check failed');
    }

    return {
      status: 'ok',
      info: {
        database: {
          status: 'up',
        },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
