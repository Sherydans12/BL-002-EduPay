import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { FindSentCommunicationsQueryDto } from './dto/find-sent-communications-query.dto';
import { LogCommunicationDto } from './dto/log-communication.dto';

type SentCommunicationFilters = Pick<
  FindSentCommunicationsQueryDto,
  'search' | 'status' | 'type'
>;

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private getCurrentTenantId(): string {
    const tenantId = tenantContext.getStore()?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(
        'Debe seleccionar un colegio para consultar comunicaciones',
      );
    }

    return tenantId;
  }
}
