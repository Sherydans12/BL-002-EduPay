import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { tenantContext } from './tenant.context';
import { TenantMiddleware } from './tenant.middleware';

describe('TenantMiddleware', () => {
  const secret = 'tenant-middleware-test-secret';
  const response = {} as Response;
  const config = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;

  it('crea contexto desde un JWT de usuario tenant', () => {
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

    new TenantMiddleware(config).use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('crea contexto S2S desde x-tenant-id', () => {
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

    new TenantMiddleware(config).use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('permite al SUPER_ADMIN operar sin tenant', () => {
    const token = new JwtService({ secret }).sign({ role: 'SUPER_ADMIN' });
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
      ),
    } as unknown as Request;
    const next = jest.fn(() => {
      expect(tenantContext.getStore()).toEqual({
        tenantId: '',
        isSuperAdmin: true,
      });
    }) as NextFunction;

    new TenantMiddleware(config).use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('permite al SUPER_ADMIN seleccionar tenant desde x-tenant-id', () => {
    const token = new JwtService({ secret }).sign({
      tenantId: 'colegio-conquistadores',
      role: 'SUPER_ADMIN',
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

    new TenantMiddleware(config).use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falla cerrado para un usuario tenant sin tenantId', () => {
    const token = new JwtService({ secret }).sign({ role: 'ADMIN' });
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
      ),
    } as unknown as Request;

    expect(() =>
      new TenantMiddleware(config).use(request, response, jest.fn()),
    ).toThrow(UnauthorizedException);
  });
});
