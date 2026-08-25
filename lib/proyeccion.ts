// Proyeccion determinista: matematica financiera, sin modelo de lenguaje.
// Un LLM puede devolver un numero plausible y equivocado, y sobre esto se toman
// decisiones de plata.
//
// TODO esta expresado en USD reales de hoy. En un pais con inflacion alta, un
// saldo nominal en pesos a tres años no significa nada: "vas a tener 40 millones"
// no dice si eso alcanza para un auto. Fijando la unidad en poder de compra de
// hoy, los numeros se pueden comparar entre si y contra una meta.

export type Estrategia = 'PESOS' | 'DOLARES' | 'INDICE';

export const ESTRATEGIAS: { id: Estrategia; nombre: string; descripcion: string }[] = [
  { id: 'PESOS', nombre: 'Pesos', descripcion: 'El ahorro queda en pesos (caja de ahorro o efectivo).' },
  { id: 'DOLARES', nombre: 'Dolares', descripcion: 'Se compran dolares y se los deja quietos.' },
  { id: 'INDICE', nombre: 'Indice S&P 500', descripcion: 'Se invierte en un indice amplio de acciones (CEDEAR SPY o similar).' },
];

// Retornos ANUALES REALES en dolares: ya descuentan inflacion. Son supuestos
// editables, no predicciones: el rendimiento pasado no garantiza el futuro y
// cualquiera de estos numeros puede ser muy distinto en un año concreto.
export type Supuestos = {
  tipoCambioArs: number;        // pesos por dolar, hoy
  retornoRealPesos: number;     // % anual
  retornoRealDolares: number;   // % anual
  retornoRealIndice: number;    // % anual
};

export const SUPUESTOS_DEFAULT: Supuestos = {
  // Sin valor razonable por defecto: cambia todo el tiempo y hay que ponerlo.
  tipoCambioArs: 1000,
  // Los pesos quietos pierden poder de compra contra el dolar.
  retornoRealPesos: -10,
  // Dolares sin invertir: apenas por debajo o cerca de la inflacion de EE.UU.
  retornoRealDolares: 0,
  // ~7% es el retorno real historico de largo plazo del S&P 500. Es un promedio
  // de decadas, con caidas de 30%+ en el medio; no es lo que rinde cada año.
  retornoRealIndice: 7,
};

export const RETORNO_POR_ESTRATEGIA = (s: Supuestos): Record<Estrategia, number> => ({
  PESOS: s.retornoRealPesos,
  DOLARES: s.retornoRealDolares,
  INDICE: s.retornoRealIndice,
});

export type PuntoProyeccion = {
  mes: number;              // 0 = hoy
  periodo: string;          // YYYY-MM
  aportado: number;         // USD reales puestos hasta ese mes
  saldos: Record<Estrategia, number>;
};

// Tasa mensual equivalente a una anual, componiendo: (1+a)^(1/12) - 1.
// Dividir por 12 sobreestima, y a 10 años la diferencia no es menor.
export function tasaMensual(anualPct: number): number {
  return Math.pow(1 + anualPct / 100, 1 / 12) - 1;
}

function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function proyectar(params: {
  aporteMensualUsd: number;
  meses: number;
  supuestos: Supuestos;
  saldoInicialUsd?: number;
  desde?: string;              // YYYY-MM, default hoy
}): PuntoProyeccion[] {
  const { aporteMensualUsd, meses, supuestos, saldoInicialUsd = 0 } = params;
  const desde = params.desde ?? new Date().toISOString().slice(0, 7);
  const retornos = RETORNO_POR_ESTRATEGIA(supuestos);

  const saldos: Record<Estrategia, number> = {
    PESOS: saldoInicialUsd, DOLARES: saldoInicialUsd, INDICE: saldoInicialUsd,
  };
  const puntos: PuntoProyeccion[] = [
    { mes: 0, periodo: desde, aportado: saldoInicialUsd, saldos: { ...saldos } },
  ];

  for (let mes = 1; mes <= meses; mes++) {
    for (const e of ['PESOS', 'DOLARES', 'INDICE'] as Estrategia[]) {
      // Renta sobre el saldo previo y recien despues el aporte del mes: el
      // aporte no rinde el mes en que entra (anualidad vencida).
      saldos[e] = saldos[e] * (1 + tasaMensual(retornos[e])) + aporteMensualUsd;
    }
    puntos.push({
      mes,
      periodo: sumarMeses(desde, mes),
      aportado: saldoInicialUsd + aporteMensualUsd * mes,
      saldos: { ...saldos },
    });
  }
  return puntos;
}

// En que mes una estrategia alcanza el objetivo. null si no llega en el horizonte
// proyectado: es informacion, no un error, y la UI tiene que poder decirlo.
export function mesQueAlcanza(
  puntos: PuntoProyeccion[], objetivoUsd: number, estrategia: Estrategia,
): PuntoProyeccion | null {
  return puntos.find(p => p.saldos[estrategia] >= objetivoUsd) ?? null;
}

// Promedio de los ultimos N meses cerrados. Un solo mes no es una tendencia,
// pero es lo que hay cuando recien se empieza a usar la app.
export function promedioMensual(
  cierres: { ingresoArs: number; gastoArs: number }[], ultimos = 6,
): { ingresoArs: number; gastoArs: number; meses: number } {
  const usados = cierres.slice(-ultimos);
  if (!usados.length) return { ingresoArs: 0, gastoArs: 0, meses: 0 };
  return {
    ingresoArs: usados.reduce((s, c) => s + c.ingresoArs, 0) / usados.length,
    gastoArs: usados.reduce((s, c) => s + c.gastoArs, 0) / usados.length,
    meses: usados.length,
  };
}
