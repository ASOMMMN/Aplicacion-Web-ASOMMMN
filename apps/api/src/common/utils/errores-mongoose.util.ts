import { HttpStatus } from '@nestjs/common';

/**
 * Traduce los errores de Mongoose/MongoDB que llegan sin capturar al filtro
 * global a una respuesta HTTP útil (400/409) en vez de un 500 opaco. Se
 * reconocen por `name`/`code` para no depender de la instancia de mongoose.
 * Los mensajes no exponen valores enviados ni detalles internos.
 */
export interface ErrorTraducido {
  status: HttpStatus;
  body: { statusCode: number; message: string; error: string };
}

interface ErrorDeCampo {
  kind?: string;
  path?: string;
}

function describirCampo(campo: string, err: ErrorDeCampo | undefined): string {
  switch (err?.kind) {
    case 'required':
      return `"${campo}" es obligatorio`;
    case 'enum':
      return `"${campo}" tiene un valor no permitido`;
    case 'min':
    case 'max':
      return `"${campo}" está fuera del rango permitido`;
    case 'minlength':
    case 'maxlength':
      return `"${campo}" no tiene una longitud válida`;
    default:
      // Errores de conversión (CastError dentro del ValidationError) y validadores propios.
      return `"${campo}" no es válido`;
  }
}

const bad = (message: string): ErrorTraducido => ({
  status: HttpStatus.BAD_REQUEST,
  body: { statusCode: HttpStatus.BAD_REQUEST, message, error: 'Bad Request' },
});

export function traducirErrorMongoose(
  exception: unknown,
): ErrorTraducido | null {
  if (!(exception instanceof Error)) return null;
  const e = exception as Error & {
    kind?: string;
    path?: string;
    code?: number;
    errors?: Record<string, ErrorDeCampo>;
  };

  if (
    e.name === 'ValidationError' &&
    e.errors &&
    typeof e.errors === 'object'
  ) {
    const campos = Object.keys(e.errors);
    const detalle = campos
      .map((c) => describirCampo(c, e.errors?.[c]))
      .join('; ');
    return bad(
      campos.length ? `Datos inválidos: ${detalle}.` : 'Datos inválidos.',
    );
  }

  if (e.name === 'CastError') {
    if (e.kind === 'ObjectId') return bad('El identificador no es válido.');
    return bad(
      e.path
        ? `"${e.path}" tiene un formato inválido.`
        : 'Algún dato tiene un formato inválido.',
    );
  }

  // Índice único violado (MongoServerError E11000).
  if (e.code === 11000) {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        statusCode: HttpStatus.CONFLICT,
        message: 'Ya existe un registro con esos datos.',
        error: 'Conflict',
      },
    };
  }

  return null;
}
