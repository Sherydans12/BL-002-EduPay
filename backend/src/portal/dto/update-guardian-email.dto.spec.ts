import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePortalGuardianEmailDto } from './update-guardian-email.dto';

describe('UpdatePortalGuardianEmailDto', () => {
  const validPayload = {
    email: 'nuevo.correo@example.cl',
    expectedUpdatedAt: '2026-07-30T16:20:00.000Z',
  };

  it('normaliza el correo y acepta un timestamp ISO', async () => {
    const dto = plainToInstance(UpdatePortalGuardianEmailDto, {
      ...validPayload,
      email: '  Nuevo.Correo@Example.CL  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('nuevo.correo@example.cl');
  });

  it('rechaza un correo inválido', async () => {
    const dto = plainToInstance(UpdatePortalGuardianEmailDto, {
      ...validPayload,
      email: 'correo-invalido',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('email');
  });

  it('rechaza propiedades adicionales', async () => {
    const dto = plainToInstance(UpdatePortalGuardianEmailDto, {
      ...validPayload,
      name: 'No debe poder modificarse',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toContain('name');
  });

  it('rechaza expectedUpdatedAt ausente o inválido', async () => {
    const missing = plainToInstance(UpdatePortalGuardianEmailDto, {
      email: validPayload.email,
    });
    const invalid = plainToInstance(UpdatePortalGuardianEmailDto, {
      ...validPayload,
      expectedUpdatedAt: 'ayer',
    });

    expect((await validate(missing)).map((error) => error.property)).toContain(
      'expectedUpdatedAt',
    );
    expect((await validate(invalid)).map((error) => error.property)).toContain(
      'expectedUpdatedAt',
    );
  });
});
