import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { isValidRut } from './rut.util';

@ValidatorConstraint({ name: 'isValidChileanRut', async: false })
export class IsValidChileanRutConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return isValidRut(value);
  }

  defaultMessage(): string {
    return 'RUT inválido: dígito verificador incorrecto';
  }
}

export function IsValidChileanRut(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidChileanRutConstraint,
    });
  };
}
