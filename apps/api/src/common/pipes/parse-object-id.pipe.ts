import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Valida que un parámetro sea un ObjectId de MongoDB (24 caracteres hex).
 * Evita que un ID mal formado llegue a Mongoose y termine en un 500 (CastError).
 *
 * Nota: no usamos Types.ObjectId.isValid() porque acepta cualquier string
 * de 12 caracteres.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) {
      throw new BadRequestException('ID inválido.');
    }
    return value;
  }
}
