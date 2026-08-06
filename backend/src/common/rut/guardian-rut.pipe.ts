import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { formatRut, isValidRut } from './rut.util';

@Injectable()
export class GuardianRutPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value || !isValidRut(value)) {
      throw new BadRequestException('RUT inválido');
    }

    return formatRut(value);
  }
}
