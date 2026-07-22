import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from './tenant.context';
import { TenantMiddleware } from './tenant.middleware';

describe('TenantMiddleware', () => {
  const secret = 'tenant-middleware-test-secret';
  const response = {} as Response;
  const config = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
  const prisma = {
    tenant: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'colegio-pruebas' });
  });

  it('crea contexto desde un JWT de usuario tenant', async () => {
    const token = new JwtService({ secret }).sign({
      tenantId: 'colegio-pruebas',
      role: 'ADMIN',
    });
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
      ),
    } as unknown as Request;
    const next = jest.fn(() => {
      expect(tenantContext.getStore()).toEqual({
        tenantId: 'colegio-pruebas',
        isSuperAdmin: false,
      });
    }) as NextFunction;

    await new TenantMiddleware(config, prisma as unknown as PrismaService).use(
      request,
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('crea contexto S2S desde x-tenant-id', async () => {
    const request = {
      header: jest.fn((name: string) =>
        name === 'x-tenant-id' ? 'colegio-pruebas' : 'Bearer portal-key',
      ),
    } as unknown as Request;
    const next = jest.fn(() => {
      expect(tenantContext.getStore()).toEqual({
        tenantId: 'colegio-pruebas',
        isSuperAdmin: false,
      });
    }) as NextFunction;

    await new TenantMiddleware(config, prisma as unknown as PrismaService).use(
      request,
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('permite al SUPER_ADMIN operar sin tenant', async () => {
    const token = new JwtService({ secret }).sign({ role: 'SUPER_ADMIN' });
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
      ),
    } as unknown as Request;
    const next = jest.fn(() => {
      expect(tenantContext.getStore()).toEqual({
        tenantId: null,
        isSuperAdmin: true,
      });
    }) as NextFunction;

    await new TenantMiddleware(config, prisma as unknown as PrismaService).use(
      request,
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['string', 'SUPER_ADMIN'],
    ['objeto', { name: 'SUPER_ADMIN' }],
  ])(
    'permite al SUPER_ADMIN con rol como %s seleccionar tenant desde x-tenant-id',
    async (_label, role) => {
      const token = new JwtService({ secret }).sign({
        tenantId: 'colegio-conquistadores',
        role,
      });
      const request = {
        header: jest.fn((name: string) => {
          if (name === 'authorization') return `Bearer ${token}`;
          if (name === 'x-tenant-id') return 'colegio-pruebas';
          return undefined;
        }),
      } as unknown as Request;
      const next = jest.fn(() => {
        expect(tenantContext.getStore()).toEqual({
          tenantId: 'colegio-pruebas',
          isSuperAdmin: true,
        });
      }) as NextFunction;

      await new TenantMiddleware(
        config,
        prisma as unknown as PrismaService,
      ).use(request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'colegio-pruebas' },
        select: { id: true },
      });
    },
  );

  it('ignora x-tenant-id para un usuario normal y usa su tenant propio', async () => {
    const token = new JwtService({ secret }).sign({
      tenantId: 'colegio-origen',
      role: { name: 'ADMIN' },
    });
    const request = {
      header: jest.fn((name: string) => {
        if (name === 'authorization') return `Bearer ${token}`;
        if (name === 'x-tenant-id') return 'colegio-pruebas';
        return undefined;
      }),
    } as unknown as Request;
    const next = jest.fn(() => {
      expect(tenantContext.getStore()).toEqual({
        tenantId: 'colegio-origen',
        isSuperAdmin: false,
      });
    }) as NextFunction;

    await new TenantMiddleware(config, prisma as unknown as PrismaService).use(
      request,
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'colegio-origen' },
      select: { id: true },
    });
  });

  it('falla cerrado para un usuario tenant sin tenantId', async () => {
    const token = new JwtService({ secret }).sign({ role: 'ADMIN' });
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
      ),
    } as unknown as Request;

    await expect(
      new TenantMiddleware(config, prisma as unknown as PrismaService).use(
        request,
        response,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('responde 404 y no crea contexto para un tenant inexistente', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    const token = new JwtService({ secret }).sign({
      role: { name: 'SUPER_ADMIN' },
    });
    const request = {
      header: jest.fn((name: string) => {
        if (name === 'authorization') return `Bearer ${token}`;
        if (name === 'x-tenant-id') return 'tenant-inactivo';
        return undefined;
      }),
    } as unknown as Request;
    const next = jest.fn();

    const result = new TenantMiddleware(
      config,
      prisma as unknown as PrismaService,
    ).use(request, response, next);

    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    await expect(result).rejects.toThrow('El colegio seleccionado no existe');
    expect(next).not.toHaveBeenCalled();
  });
});
