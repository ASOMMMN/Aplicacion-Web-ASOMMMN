export interface DuracionEmbarque {
  anios: number;
  meses: number;
  dias: number;
  totalDias: number;
}

export interface TiempoTotalMar {
  anios: number;
  meses: number;
  totalDias: number;
}

const DIAS_POR_ANIO = 365.25;
const DIAS_POR_MES = 30.4375;

/**
 * Duración calendario (años/meses/días) de un embarque individual, más el
 * total exacto de días — usado para sumar el tiempo total de mar.
 */
export function calcularDuracion(desde: Date, hasta: Date): DuracionEmbarque {
  let anios = hasta.getFullYear() - desde.getFullYear();
  let meses = hasta.getMonth() - desde.getMonth();
  let dias = hasta.getDate() - desde.getDate();

  if (dias < 0) {
    meses -= 1;
    const ultimoDiaMesAnterior = new Date(
      hasta.getFullYear(),
      hasta.getMonth(),
      0,
    ).getDate();
    dias += ultimoDiaMesAnterior;
  }
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }

  const totalDias = Math.round(
    (hasta.getTime() - desde.getTime()) / 86_400_000,
  );

  return { anios, meses, dias, totalDias };
}

/**
 * Convierte el total de días acumulados (suma de todos los embarques) a
 * años/meses aproximados, usando promedios calendario (365.25 / 30.4375),
 * ya que los días individuales de cada periodo no se pueden sumar de forma
 * exacta en unidades calendario.
 */
export function calcularTiempoTotal(
  totalDiasAcumulado: number,
): TiempoTotalMar {
  const anios = Math.floor(totalDiasAcumulado / DIAS_POR_ANIO);
  const diasRestantes = totalDiasAcumulado - anios * DIAS_POR_ANIO;
  let meses = Math.round(diasRestantes / DIAS_POR_MES);

  let aniosFinal = anios;
  if (meses === 12) {
    aniosFinal += 1;
    meses = 0;
  }

  return { anios: aniosFinal, meses, totalDias: totalDiasAcumulado };
}
