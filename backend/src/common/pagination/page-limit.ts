import { BadRequestException } from '@nestjs/common';

/**
 * Upper bound for a single page of a list endpoint. 200 is the largest page
 * size the FRONT requests today; larger values are rejected instead of letting
 * a client pull an unbounded roster in one response.
 */
export const MAX_PAGE_LIMIT = 200;

/** Rejects non-positive pages and page sizes outside 1..MAX_PAGE_LIMIT. */
export function assertPageLimit(page: number, limit: number): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new BadRequestException('page debe ser un entero mayor o igual a 1.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new BadRequestException(
      `limit debe ser un entero entre 1 y ${MAX_PAGE_LIMIT}.`,
    );
  }
}
