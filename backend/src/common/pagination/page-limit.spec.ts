import { BadRequestException } from '@nestjs/common';

import { assertPageLimit, MAX_PAGE_LIMIT } from './page-limit';

describe('assertPageLimit', () => {
  it('accepts the bounded range used by the FRONT', () => {
    expect(() => assertPageLimit(1, 1)).not.toThrow();
    expect(() => assertPageLimit(3, 20)).not.toThrow();
    expect(() => assertPageLimit(1, MAX_PAGE_LIMIT)).not.toThrow();
  });

  it.each([
    [0, 20],
    [-1, 20],
    [1.5, 20],
  ])('rejects page %p', (page, limit) => {
    expect(() => assertPageLimit(page, limit)).toThrow(BadRequestException);
  });

  it.each([0, -5, MAX_PAGE_LIMIT + 1, 100_000, 2.5])(
    'rejects limit %p',
    (limit) => {
      expect(() => assertPageLimit(1, limit)).toThrow(BadRequestException);
    },
  );
});
