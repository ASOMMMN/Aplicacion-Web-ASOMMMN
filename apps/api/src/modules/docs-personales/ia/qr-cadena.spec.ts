import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as QRCode from 'qrcode';
import {
  buscarCadenaOriginal,
  fuentesEstructuradas,
  leerCadena,
  leerQrs,
} from './qr-cadena';

// Sin datos personales: folios y fechas de ejemplo.
const CADENA = '||FOLIO:0000000|DICTAMEN:19/12/2025|VIGENCIA:19/12/2027||';

/** Hoja carta con un QR abajo a la izquierda y "texto" alrededor. */
async function hojaConQr(contenido: string) {
  const qr = await loadImage(
    await QRCode.toBuffer(contenido, { width: 260, margin: 2 }),
  );
  const c = createCanvas(1700, 2200);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1700, 2200);
  ctx.fillStyle = '#000';
  for (let y = 150; y < 1500; y += 50) ctx.fillRect(150, y, 1300, 14);
  ctx.drawImage(qr, 150, 1800);
  return c;
}

describe('QR y cadena original', () => {
  it('lee el QR de una página y sus fechas (DICTAMEN/VIGENCIA)', async () => {
    const qrs = leerQrs(await hojaConQr(CADENA));
    expect(qrs).toEqual([CADENA]);
    const [fuente] = fuentesEstructuradas(1, qrs, '');
    expect(fuente.origen).toBe('qr');
    expect(fuente.texto).toBe(CADENA); // evidencia
    expect(fuente.lecturas.map((l) => `${l.campo}=${l.clave}`)).toEqual([
      'fechaEmision=2025-12-19',
      'fechaVencimiento=2027-12-19',
    ]);
    expect(fuente.lecturas.every((l) => l.fuente === 'qr')).toBe(true);
  });

  it('un QR con solo una URL no aporta fechas (se guarda como evidencia)', async () => {
    const url = 'https://ejemplo.gob.mx/validacion?id=abc';
    const [fuente] = fuentesEstructuradas(1, leerQrs(await hojaConQr(url)), '');
    expect(fuente.texto).toBe(url);
    expect(fuente.lecturas).toEqual([]);
  });

  it('página sin QR → ninguno', () => {
    const c = createCanvas(800, 1000);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 1000);
    expect(leerQrs(c)).toEqual([]);
  });

  it('cadena original en la capa de texto del PDF', () => {
    const texto = `CERTIFICADO MÉDICO\nSello digital: abc123\nCadena Original:\n${CADENA}\nPágina 1 de 1`;
    expect(buscarCadenaOriginal(texto)).toBe(CADENA);
    const [f] = fuentesEstructuradas(1, [], texto);
    expect(f.origen).toBe('cadena_original');
    expect(f.lecturas).toHaveLength(2);
  });

  it('claves con otros nombres (EXPEDICION, F_VENCIMIENTO)', () => {
    const r = leerCadena('EXPEDICION:09-05-2024|F_VENCIMIENTO:05-04-2029', 1);
    expect(r.map((l) => `${l.campo}=${l.clave}`)).toEqual([
      'fechaEmision=2024-05-09',
      'fechaVencimiento=2029-04-05',
    ]);
  });
});
