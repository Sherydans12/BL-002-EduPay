import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AcademicFinancialProjectionAuthGuard } from './academic-financial-projection-auth.guard';

describe('AcademicFinancialProjectionAuthGuard', () => {
  const credential = {
    keyId: 'academic-2026-01',
    token: 'registered-academic-producer-secret-at-least-32-characters',
    canonicalTenantId: '11111111-1111-4111-8111-111111111111',
  };

  function context(token: string) {
    const headers = {
      authorization: `Bearer ${token}`,
      'x-edupay-service': 'ACADEMIC_PRODUCER',
      'x-edupay-service-key-id': credential.keyId,
    };
    const request = {
      header: jest.fn(
        (name: string) => headers[name.toLowerCase() as keyof typeof headers],
      ),
    };
    return {
      request,
      execution: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  it('binds a valid producer credential to exactly one canonical tenant', () => {
    const guard = new AcademicFinancialProjectionAuthGuard({
      requireInboundCredentials: () => [credential],
    } as never);
    const input = context(credential.token);
    expect(guard.canActivate(input.execution)).toBe(true);
    expect(
      (
        input.request as typeof input.request & {
          academicFinancialProjectionPrincipal?: unknown;
        }
      ).academicFinancialProjectionPrincipal,
    ).toEqual({
      keyId: credential.keyId,
      canonicalTenantId: credential.canonicalTenantId,
    });
  });

  it('rejects a user JWT or forged service header', () => {
    const guard = new AcademicFinancialProjectionAuthGuard({
      requireInboundCredentials: () => [credential],
    } as never);
    expect(() =>
      guard.canActivate(context('header.payload.signature').execution),
    ).toThrow(UnauthorizedException);
  });
});
