import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PortalApiKeyMiddleware } from './portal-api-key.middleware';

describe('PortalApiKeyMiddleware', () => {
  const response = {} as Response;
  const next = jest.fn() as NextFunction;
  const originalPortalTenantKeys = process.env.PORTAL_TENANT_KEYS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PORTAL_TENANT_KEYS = JSON.stringify({
      'colegio-conquistadores': 'portal-secret-1',
      'colegio-pruebas': 'portal-secret-2',
    });
  });

  afterAll(() => {
    if (originalPortalTenantKeys === undefined) {
      delete process.env.PORTAL_TENANT_KEYS;
    } else {
      process.env.PORTAL_TENANT_KEYS = originalPortalTenantKeys;
    }
  });

  it('permite un Bearer Token válido', () => {
    const middleware = new PortalApiKeyMiddleware();
    const request = {
      headers: {},
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret-2' : 'colegio-pruebas',
      ),
    } as unknown as Request;

    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza tokens ausentes o inválidos', () => {
    const middleware = new PortalApiKeyMiddleware();
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer incorrect' : 'colegio-pruebas',
      ),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una key válida usada contra otro tenant', () => {
    const middleware = new PortalApiKeyMiddleware();
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret-1' : 'colegio-pruebas',
      ),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza solicitudes sin x-tenant-id', () => {
    const middleware = new PortalApiKeyMiddleware();
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret-2' : undefined,
      ),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      BadRequestException,
    );
  });

  it('falla cerrado cuando PORTAL_TENANT_KEYS no está configurada', () => {
    delete process.env.PORTAL_TENANT_KEYS;
    const middleware = new PortalApiKeyMiddleware();
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret-2' : 'colegio-pruebas',
      ),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      InternalServerErrorException,
    );
  });
});
