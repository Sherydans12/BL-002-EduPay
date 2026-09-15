import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CanonicalMappingPlatformGuard } from './guards/canonical-mapping-platform.guard';
import { TenantsController } from './tenants.controller';

describe('TenantsController guard coverage', () => {
  it('keeps the tenant listing on the existing SUPER_ADMIN guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController)).toContain(
      SuperAdminGuard,
    );
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        TenantsController.prototype.findActive,
      ),
    ).toBeUndefined();
  });

  it.each([
    ['findCanonicalMapping', TenantsController.prototype.findCanonicalMapping],
    [
      'assignCanonicalMapping',
      TenantsController.prototype.assignCanonicalMapping,
    ],
  ])('applies the platform guard to %s', (_operation, handler) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      CanonicalMappingPlatformGuard,
    );
  });
});
