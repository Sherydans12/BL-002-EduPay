import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';
import {
  AcademicFinancialProjectionService,
  type AcademicFinancialProjectionEvent,
} from './academic-financial-projection.service';

type SourceStart = {
  readonly snapshotToken: string;
  readonly snapshot: {
    readonly snapshotId: string;
    readonly canonicalTenantId: string;
  };
};
type SourcePage = {
  readonly items: AcademicFinancialProjectionEvent['payload'][];
  readonly page: {
    readonly nextCursor: string | null;
    readonly complete: boolean;
    readonly itemCount: number;
  };
  readonly watermark: {
    readonly value: string | null;
    readonly available: boolean;
  };
};

@Injectable()
export class AcademicFinancialProjectionSnapshotService {
  private readonly logger = new Logger(
    AcademicFinancialProjectionSnapshotService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AcademicFinancialProjectionConfigService,
    private readonly projection: AcademicFinancialProjectionService,
  ) {}

  async bootstrap(tenantId: string) {
    const canonicalTenantId = await this.canonicalTenantId(tenantId);
    const credential = this.config.snapshotCredential(canonicalTenantId);
    const baseUrl = this.config.academicBaseUrl();
    const start = await this.request<SourceStart>(
      `${baseUrl}/api/v1/integrations/financial-projection/snapshots`,
      credential,
      { method: 'POST' },
    );
    if (
      !start ||
      typeof start.snapshotToken !== 'string' ||
      !start.snapshot ||
      start.snapshot.canonicalTenantId !== canonicalTenantId ||
      typeof start.snapshot.snapshotId !== 'string'
    )
      throw new BadRequestException(
        'Academic returned an invalid snapshot descriptor.',
      );
    const local = await this.prisma.academicFinancialProjectionSnapshot.create({
      data: {
        tenantId,
        canonicalTenantId,
        sourceSnapshotId: start.snapshot.snapshotId,
        sourceSnapshotToken: start.snapshotToken,
        status: 'STARTED',
      },
    });
    return this.resume(tenantId, local.id);
  }

  async resume(tenantId: string, localSnapshotId: string) {
    const snapshot =
      await this.prisma.academicFinancialProjectionSnapshot.findFirst({
        where: { id: localSnapshotId, tenantId },
      });
    if (!snapshot)
      throw new BadRequestException(
        'The local snapshot was not found for this tenant.',
      );
    if (snapshot.status === 'RECONCILED')
      return this.projection.reconcileSnapshot(tenantId, snapshot.id);
    const canonicalTenantId = await this.canonicalTenantId(tenantId);
    if (canonicalTenantId !== snapshot.canonicalTenantId) {
      throw new BadRequestException(
        'The tenant canonical mapping changed while the snapshot was pending.',
      );
    }
    const credential = this.config.snapshotCredential(canonicalTenantId);
    const baseUrl = this.config.academicBaseUrl();
    let cursor = snapshot.nextCursor ?? undefined;
    let received = snapshot.receivedItemCount;
    try {
      for (;;) {
        const query = new URLSearchParams({
          limit: '100',
          ...(cursor ? { cursor } : {}),
        });
        const page = await this.request<SourcePage>(
          `${baseUrl}/api/v1/integrations/financial-projection/snapshots/${snapshot.sourceSnapshotToken}/enrollments?${query.toString()}`,
          credential,
        );
        this.assertPage(page, canonicalTenantId);
        for (const item of page.items) {
          await this.projection.applySnapshotItem({
            tenantId,
            canonicalTenantId,
            snapshotId: snapshot.id,
            item,
          });
        }
        received += page.items.length;
        cursor = page.page.nextCursor ?? undefined;
        await this.prisma.academicFinancialProjectionSnapshot.update({
          where: { id: snapshot.id },
          data: {
            status: page.page.complete ? 'COMPLETE' : 'INCOMPLETE',
            receivedItemCount: received,
            nextCursor: cursor ?? null,
          },
        });
        if (!page.page.complete) continue;
        const complete = await this.request<{ watermark?: unknown }>(
          `${baseUrl}/api/v1/integrations/financial-projection/snapshots/${snapshot.sourceSnapshotToken}/complete`,
          credential,
        );
        const watermark =
          typeof complete?.watermark === 'string'
            ? complete.watermark
            : page.watermark.value;
        if (!watermark)
          throw new BadRequestException(
            'Academic did not confirm a terminal snapshot watermark.',
          );
        await this.prisma.academicFinancialProjectionSnapshot.update({
          where: { id: snapshot.id },
          data: {
            status: 'COMPLETE',
            watermark,
            expectedItemCount: received,
            completedAt: new Date(),
            nextCursor: null,
            errorCode: null,
          },
        });
        return this.projection.reconcileSnapshot(tenantId, snapshot.id);
      }
    } catch (error) {
      await this.prisma.academicFinancialProjectionSnapshot.update({
        where: { id: snapshot.id },
        data: {
          // A failure after a page has been committed is resumable. Keep the
          // durable cursor and advertise that no reconciliation is allowed
          // until the remaining pages are drained.
          status: cursor ? 'INCOMPLETE' : 'FAILED',
          errorCode: this.safeErrorCode(error),
          nextCursor: cursor ?? null,
        },
      });
      this.logger.warn({
        action: 'ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_FAILED',
        snapshotId: snapshot.id,
        tenantId,
        code: this.safeErrorCode(error),
      });
      throw error;
    }
  }

  private async canonicalTenantId(tenantId: string): Promise<string> {
    const mapping = await this.prisma.tenantCanonicalMapping.findUnique({
      where: { tenantId },
      select: { canonicalTenantId: true },
    });
    if (!mapping)
      throw new BadRequestException(
        'The local tenant has no explicit canonical tenant mapping.',
      );
    return mapping.canonicalTenantId;
  }

  private async request<T>(
    url: string,
    credential: { keyId: string; token: string },
    init: RequestInit = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs(),
    );
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${credential.token}`,
          'X-EduPay-Service': 'BL_SHADOW',
          'X-EduPay-Service-Key-Id': credential.keyId,
          ...(init.method === 'POST'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertPage(page: SourcePage, canonicalTenantId: string): void {
    if (
      !page ||
      !Array.isArray(page.items) ||
      !page.page ||
      page.page.itemCount !== page.items.length ||
      page.page.complete !== (page.page.nextCursor === null)
    ) {
      throw new BadRequestException(
        'Academic returned an invalid snapshot page.',
      );
    }
    if (
      page.items.some((item) => item.canonicalTenantId !== canonicalTenantId)
    ) {
      throw new BadRequestException(
        'Academic returned a cross-tenant snapshot item.',
      );
    }
  }

  private safeErrorCode(error: unknown): string {
    const value = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    return value.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80) || 'UNKNOWN_ERROR';
  }
}
