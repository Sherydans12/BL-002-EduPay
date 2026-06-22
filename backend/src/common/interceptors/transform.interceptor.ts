import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Estructura de respuesta unificada de la API.
 * - `data`: payload principal
 * - `meta`: metadatos de paginación (cuando aplica)
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Interceptor global que envuelve todas las respuestas exitosas
 * en la estructura `{ data, meta? }`.
 *
 * Si el servicio retorna un objeto con `data` y `meta`,
 * lo propaga directamente. Caso contrario, envuelve el resultado.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        // Si el servicio ya devuelve la estructura paginada { data, meta }
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result
        ) {
          return result as ApiResponse<T>;
        }

        // Respuesta simple → envolver en { data }
        return { data: result };
      }),
    );
  }
}
