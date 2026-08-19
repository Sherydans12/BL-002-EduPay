import { validateNameTokenPreservation } from './student-name-validation.util';

describe('validateNameTokenPreservation', () => {
  it('accepts valid 2-token partition regardless of given/surname split order', () => {
    const result = validateNameTokenPreservation(
      'NICOLAS SENA',
      'Nicolas',
      'Sena',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts valid 3-token partition (2 surnames, 1 given name)', () => {
    const result = validateNameTokenPreservation(
      'VICENTE ESCOBAR MARIN',
      'Vicente',
      'Escobar Marin',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts valid 3-token partition (1 surname, 2 given names)', () => {
    const result = validateNameTokenPreservation(
      'TOBIAS ZABALA NARVAI',
      'Tobias Zabala',
      'Narvai',
    );
    expect(result.valid).toBe(true);
  });

  it('is case-insensitive and accent-insensitive', () => {
    const result = validateNameTokenPreservation(
      'PÉREZ GÓMEZ MARÍA JOSÉ',
      'Maria Jose',
      'Perez Gomez',
    );
    expect(result.valid).toBe(true);
  });

  it('rejects when a token is omitted', () => {
    const result = validateNameTokenPreservation(
      'VICENTE ESCOBAR MARIN',
      'Vicente',
      'Escobar',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('El número de palabras no coincide');
  });

  it('rejects when an extra token is added', () => {
    const result = validateNameTokenPreservation(
      'VICENTE ESCOBAR MARIN',
      'Vicente Jose',
      'Escobar Marin',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('El número de palabras no coincide');
  });

  it('rejects when a word spelling is altered', () => {
    const result = validateNameTokenPreservation(
      'VICENTE ESCOBAR MARIN',
      'Vicen',
      'Escobar Marin',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('no coincide con las palabras');
  });

  it('rejects empty inputs', () => {
    expect(validateNameTokenPreservation('', 'Juan', 'Perez').valid).toBe(false);
    expect(validateNameTokenPreservation('JUAN PEREZ', '', 'Perez').valid).toBe(false);
    expect(validateNameTokenPreservation('JUAN PEREZ', 'Juan', '').valid).toBe(false);
  });
});
