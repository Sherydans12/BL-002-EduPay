import { ExecutionContext, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AcademicoAuthGuard } from './academico-auth.guard';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';
import { randomUUID } from 'node:crypto';

describe('AcademicoAuthGuard', () => {
  const validToken = `${randomUUID()}${randomUUID()}`;
  const config = {
    authenticationTokens: jest.fn(() => [validToken]),
    allowedTenants: jest.fn(() => new Set(['allowed-tenant'])),
  };
  const prisma = {
    tenant: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.findFirst.mockResolvedValue({ id: 'allowed-tenant' });
  });

  function context(token?: string, tenant = 'allowed-tenant') {
    const headers: Record<string, string> = {
      'x-source-tenant-id': tenant,
      'x-correlation-id': 'auth-guard-test',
    };
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    const request = {
      headers,
      header: jest.fn((name: string) => headers[name.toLowerCase()]),
    } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const execution = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
    return { execution, request, response };
  }

  async function expectCode(
    promise: Promise<boolean>,
    code: string,
  ): Promise<void> {
    try {
      await promise;
      throw new Error('Expected guard rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    }
  }

  it('accepts the dedicated token and resolves exactly one allowed tenant', async () => {
    const requestContext = context(validToken);
    const guard = new AcademicoAuthGuard(
      config as unknown as AcademicoIntegrationConfigService,
      prisma as unknown as PrismaService,
    );

    await expect(guard.canActivate(requestContext.execution)).resolves.toBe(
      true,
    );
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: 'allowed-tenant', isActive: true },
      select: { id: true },
    });
    expect(requestContext.response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'auth-guard-test',
    );
  });

  it.each([
    ['missing token', undefined],
    ['wrong token', `${randomUUID()}${randomUUID()}`],
    ['ordinary administrator JWT', 'header.payload.signature'],
  ])('denies a %s', async (_label, token) => {
    const guard = new AcademicoAuthGuard(
      config as unknown as AcademicoIntegrationConfigService,
      prisma as unknown as PrismaService,
    );
    await expectCode(
      guard.canActivate(context(token).execution),
      'INTEGRATION_AUTHENTICATION_FAILED',
    );
  });

  it('denies a source tenant outside the server allowlist', async () => {
    const guard = new AcademicoAuthGuard(
      config as unknown as AcademicoIntegrationConfigService,
      prisma as unknown as PrismaService,
    );
    await expectCode(
      guard.canActivate(context(validToken, 'forbidden-tenant').execution),
      'INTEGRATION_TENANT_FORBIDDEN',
    );
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });
});
