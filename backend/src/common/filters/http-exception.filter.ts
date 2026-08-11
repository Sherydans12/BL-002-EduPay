import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Filtro global de excepciones.
 * Captura HttpException estándar y errores conocidos de Prisma,
 * devolviendo una estructura JSON unificada al cliente.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let code: string | undefined;

    // ─── HttpException estándar de NestJS ─────────────────────
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) || exception.message;
        code = typeof res.code === 'string' ? res.code : undefined;
      }
    }

    // ─── Errores conocidos de Prisma ──────────────────────────
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          statusCode = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[]) || [];
          message = `Ya existe un registro con ${target.join(', ')} duplicado`;
          break;
        }
        case 'P2003': {
          statusCode = HttpStatus.BAD_REQUEST;
          message =
            'Referencia a un registro inexistente (clave foránea inválida)';
          break;
        }
        case 'P2025': {
          statusCode = HttpStatus.NOT_FOUND;
          message = 'El registro solicitado no existe';
          break;
        }
        default: {
          statusCode = HttpStatus.BAD_REQUEST;
          message = `Error de base de datos: ${exception.code}`;
        }
      }
    }

    // ─── Errores de validación de Prisma ──────────────────────
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Error de validación en la consulta a la base de datos';
    }

    // ─── Error genérico ──────────────────────────────────────
    else if (exception instanceof Error) {
      message = exception.message;
    }

    if (
      !code &&
      statusCode === HttpStatus.BAD_REQUEST &&
      request.url.includes('/v1/integrations/academico')
    ) {
      code = 'INVALID_INTEGRATION_REQUEST';
    }

    const logPath = request.url.includes('/v1/integrations/academico')
      ? request.path
      : request.url;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Nunca exponer detalles de Prisma/PostgreSQL (ni mensajes internos) al
      // cliente. El diagnóstico completo queda exclusivamente en los logs.
      message = 'Error interno del servidor';
      this.logger.error(
        `[CRITICAL_SYSTEM_ERROR] [${request.method}] ${logPath} → ${statusCode}`,
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${logPath} → ${statusCode}${code ? ` category=${code}` : ''}`,
      );
    }

    const correlationId =
      typeof request.header === 'function'
        ? request.header('x-correlation-id')
        : undefined;

    response.status(statusCode).json({
      statusCode,
      ...(code ? { code } : {}),
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(correlationId ? { correlationId } : {}),
    });
  }
}
