import { HttpStatus } from '@nestjs/common';
import mongoose, { Schema } from 'mongoose';
import { traducirErrorMongoose } from './errores-mongoose.util';

/** Errores reales de Mongoose: se valida un documento sin conexión a la BD. */
const Modelo = mongoose.model(
  'PruebaErroresMongoose',
  new Schema({
    nombre: { type: String, required: true },
    estado: { type: String, enum: ['a', 'b'] },
    edad: { type: Number, min: 1 },
  }),
);

async function errorDeValidacion(
  datos: Record<string, unknown>,
): Promise<unknown> {
  try {
    await new Modelo(datos).validate();
  } catch (err) {
    return err;
  }
  throw new Error('se esperaba un ValidationError');
}

describe('traducirErrorMongoose', () => {
  it('ValidationError → 400 con los campos y su motivo, en español', async () => {
    const r = traducirErrorMongoose(
      await errorDeValidacion({ estado: 'zzz', edad: 0 }),
    );
    expect(r?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(r?.body.message).toContain('"nombre" es obligatorio');
    expect(r?.body.message).toContain('"estado" tiene un valor no permitido');
    expect(r?.body.message).toContain('"edad" está fuera del rango permitido');
  });

  it('no expone el valor enviado ni el texto en inglés de Mongoose', async () => {
    const r = traducirErrorMongoose(
      await errorDeValidacion({ nombre: 'x', estado: 'valor-secreto' }),
    );
    expect(r?.body.message).not.toContain('valor-secreto');
    expect(r?.body.message).not.toMatch(/Path|is required|not a valid enum/);
  });

  it('CastError de ObjectId → 400 "identificador no válido"', () => {
    const err = new mongoose.Error.CastError('ObjectId', 'abc', '_id');
    expect(traducirErrorMongoose(err)).toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      body: { message: 'El identificador no es válido.' },
    });
  });

  it('CastError de otro tipo → 400 con el campo', () => {
    const err = new mongoose.Error.CastError('Number', 'diez', 'edad');
    expect(traducirErrorMongoose(err)?.body.message).toBe(
      '"edad" tiene un formato inválido.',
    );
  });

  it('índice único (E11000) → 409', () => {
    const err = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
    });
    expect(traducirErrorMongoose(err)?.status).toBe(HttpStatus.CONFLICT);
  });

  it('cualquier otro error no se traduce (sigue siendo 500)', () => {
    expect(traducirErrorMongoose(new Error('boom'))).toBeNull();
    expect(traducirErrorMongoose('texto')).toBeNull();
  });
});
