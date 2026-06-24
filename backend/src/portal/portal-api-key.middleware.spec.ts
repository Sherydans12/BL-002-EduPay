import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { PortalApiKeyMiddleware } from './portal-api-key.middleware';

describe('PortalApiKeyMiddleware', () => {
  const response = {} as Response;
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permite un Bearer Token válido', () => {
    const middleware = new PortalApiKeyMiddleware({
      get: jest.fn().mockReturnValue('portal-secret'),
    } as unknown as ConfigService);
    const request = {
      headers: {},
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret' : 'colegio-pruebas',
      ),
    } as unknown as Request;

    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza tokens ausentes o inválidos', () => {
    const middleware = new PortalApiKeyMiddleware({
      get: jest.fn().mockReturnValue('portal-secret'),
    } as unknown as ConfigService);
    const request = {
      header: jest.fn().mockReturnValue('Bearer incorrect'),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza solicitudes sin x-tenant-id', () => {
    const middleware = new PortalApiKeyMiddleware({
      get: jest.fn().mockReturnValue('portal-secret'),
    } as unknown as ConfigService);
    const request = {
      header: jest.fn((name: string) =>
        name === 'authorization' ? 'Bearer portal-secret' : undefined,
      ),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      BadRequestException,
    );
  });

  it('falla cerrado cuando EDUPAY_API_KEY no está configurada', () => {
    const middleware = new PortalApiKeyMiddleware({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    const request = {
      header: jest.fn(),
    } as unknown as Request;

    expect(() => middleware.use(request, response, next)).toThrow(
      ServiceUnavailableException,
    );
  });
});
