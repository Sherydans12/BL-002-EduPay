import { BadRequestException } from '@nestjs/common';
import { GuardianRutPipe } from './guardian-rut.pipe';

describe('GuardianRutPipe', () => {
  const pipe = new GuardianRutPipe();

  it('valida y normaliza un RUT chileno', () => {
    expect(pipe.transform('12.345.678-5')).toBe('12.345.678-5');
    expect(pipe.transform('12345678-5')).toBe('12.345.678-5');
  });

  it('rechaza un RUT inválido', () => {
    expect(() => pipe.transform('12.345.678-9')).toThrow(BadRequestException);
  });
});
