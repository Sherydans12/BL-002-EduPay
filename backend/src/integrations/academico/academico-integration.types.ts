import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

export const ACADEMICO_SCHEMA_VERSION = '1';
export const ACADEMICO_MAX_PAGE_SIZE = 500;
export const ACADEMICO_DEFAULT_PAGE_SIZE = 100;

export type AcademicoEntity = 'COURSE' | 'STUDENT';
export type AcademicoFeedMode = 'full' | 'incremental';

export type AcademicoRequestContext = {
  sourceTenantId: string;
  correlationId: string;
};

export type AcademicoRequest = Request & {
  academicoIntegration?: AcademicoRequestContext;
};

export function integrationHttpException(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}
