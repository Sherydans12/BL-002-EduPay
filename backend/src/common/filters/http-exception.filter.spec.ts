import {
  ArgumentsHost,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { method: 'POST', url: '/api/v1/test' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sanitiza errores 500 y registra el stack completo como crítico', () => {
    const filter = new GlobalExceptionFilter();
    const error = new Error(
      'PrismaClientKnownRequestError: password=secret relation users does not exist',
    );
    error.stack = 'full production stack trace';
    const loggerError = jest.spyOn(Logger.prototype, 'error');

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      }),
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('[CRITICAL_SYSTEM_ERROR]'),
      'full production stack trace',
    );
  });

  it('sanitiza también HttpException con estado 500', () => {
    const filter = new GlobalExceptionFilter();

    filter.catch(
      new InternalServerErrorException('detalle interno de PostgreSQL'),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });
});
