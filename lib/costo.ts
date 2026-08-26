// Costo de entrada y resultado por activo.
//
// Determinista, como la proyeccion: un error acá no tira una excepcion, muestra
// una ganancia que no existe. Todo lo que sigue esta cubierto por tests.
//
// LA UNIDAD ES EL DOLAR. En un pais con esta inflacion, medir en pesos miente:
// un CEDEAR comprado a $10.000 que hoy vale $15.000 "gano 50%", pero si el dolar
// paso de $1.000 a $1.600, en poder de compra perdiste. Cada transaccion guarda
// el tipo de cambio de SU dia, y por eso se puede calcular bien.

export type Transaccion = {
  activo: string;
  tipo: 'COMPRA' | 'VENTA';
  fecha: string;                 // YYYY-MM-DD
  cantidad: number;
  precioUnitario: number;
  moneda: 'ARS' | 'USD';
  tipoCambioDia: number | null;  // ARS por USD el dia de la operacion
  comision: number;
};

export type EventoActivo = {
  activo: string;
  fecha: string;
  tipo: 'RATIO' | 'SPLIT' | 'DIVIDENDO_ACCIONES';
  factor: number;                // 4 = una unidad pasa a ser cuatro
};

export type Posicion = {
  activo: string;
  cantidad: number;              // unidades que quedan, ya ajustadas por eventos
  costoTotalUsd: number;         // lo invertido en lo que todavia tenes
  costoUnitarioUsd: number;      // promedio ponderado
  realizadoUsd: number;          // resultado de lo que ya vendiste
  comisionesUsd: number;
};

export type Resultado = Posicion & {
  precioActualUsd: number | null;
  valorActualUsd: number | null;
  noRealizadoUsd: number | null;
  retornoPct: number | null;
};

export class ErrorCosto extends Error {}

/** Convierte a dolares el importe de una operacion, segun su moneda. */
function aUsd(monto: number, t: Pick<Transaccion, 'moneda' | 'tipoCambioDia'>): number {
  if (t.moneda === 'USD') return monto;
  if (!t.tipoCambioDia || t.tipoCambioDia <= 0) {
    throw new ErrorCosto(
      'Una operacion en pesos necesita el tipo de cambio de su dia para poder medirse en dolares.',
    );
  }
  return monto / t.tipoCambioDia;
}

/**
 * Calcula la posicion de UN activo recorriendo su historia en orden.
 *
 * Metodo: promedio ponderado. Es lo que muestran los brokers y lo que la
 * mayoria intuye. Como se guarda el libro completo, FIFO se puede agregar
 * despues sin migrar nada.
 */
export function calcularPosicion(
  activo: string, transacciones: Transaccion[], eventos: EventoActivo[] = [],
): Posicion {
  // Orden cronologico, con los eventos intercalados donde corresponde. Un
  // evento antes o despues de una compra da resultados distintos.
  const linea = [
    ...transacciones.filter(t => t.activo === activo).map(t => ({ fecha: t.fecha, tx: t, ev: null as EventoActivo | null })),
    ...eventos.filter(e => e.activo === activo).map(e => ({ fecha: e.fecha, tx: null as Transaccion | null, ev: e })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  let cantidad = 0;
  let costoTotalUsd = 0;
  let realizadoUsd = 0;
  let comisionesUsd = 0;

  for (const paso of linea) {
    if (paso.ev) {
      // Un cambio de ratio o un split no cambia lo que vale tu posicion: se
      // multiplica la cantidad y el costo total queda igual, con lo cual el
      // costo unitario baja en la misma proporcion. Por eso NO se toca
      // costoTotalUsd: si lo tocaramos, apareceria una ganancia o perdida
      // inventada el dia del evento.
      if (paso.ev.factor <= 0) throw new ErrorCosto(`El factor de un evento tiene que ser mayor a cero (${activo}, ${paso.ev.fecha}).`);
      cantidad *= paso.ev.factor;
      continue;
    }

    const t = paso.tx!;
    const bruto = t.cantidad * t.precioUnitario;
    const comisionUsd = aUsd(t.comision, t);
    comisionesUsd += comisionUsd;

    if (t.tipo === 'COMPRA') {
      // La comision es parte de lo que te salio adquirirlo.
      costoTotalUsd += aUsd(bruto, t) + comisionUsd;
      cantidad += t.cantidad;
      continue;
    }

    // VENTA
    if (t.cantidad > cantidad + 1e-9) {
      throw new ErrorCosto(
        `Venta de ${t.cantidad} ${activo} el ${t.fecha} pero solo habia ${cantidad.toFixed(8)}. ` +
        'Falta una compra, o un cambio de ratio que todavia no esta cargado.',
      );
    }

    // Al vender, sale del costo la parte proporcional del promedio.
    const costoUnitario = cantidad > 0 ? costoTotalUsd / cantidad : 0;
    const costoVendido = costoUnitario * t.cantidad;
    realizadoUsd += aUsd(bruto, t) - costoVendido - comisionUsd;
    costoTotalUsd -= costoVendido;
    cantidad -= t.cantidad;

    // Redondeo: tras vender todo, la cantidad puede quedar en 1e-17.
    if (cantidad < 1e-9) { cantidad = 0; costoTotalUsd = 0; }
  }

  return {
    activo,
    cantidad,
    costoTotalUsd,
    costoUnitarioUsd: cantidad > 0 ? costoTotalUsd / cantidad : 0,
    realizadoUsd,
    comisionesUsd,
  };
}

/** Todas las posiciones, a partir del libro completo. */
export function calcularPosiciones(
  transacciones: Transaccion[], eventos: EventoActivo[] = [],
): Posicion[] {
  const activos = [...new Set(transacciones.map(t => t.activo))].sort();
  return activos.map(a => calcularPosicion(a, transacciones, eventos));
}

/**
 * Le suma el precio de mercado a una posicion. `precio` en null significa que no
 * se consiguio cotizacion: se devuelve null en vez de un cero, porque "no se
 * sabe" y "vale cero" son cosas muy distintas.
 */
export function conPrecio(p: Posicion, precioActualUsd: number | null): Resultado {
  if (precioActualUsd === null || !Number.isFinite(precioActualUsd)) {
    return { ...p, precioActualUsd: null, valorActualUsd: null, noRealizadoUsd: null, retornoPct: null };
  }
  const valorActualUsd = p.cantidad * precioActualUsd;
  const noRealizadoUsd = valorActualUsd - p.costoTotalUsd;
  return {
    ...p,
    precioActualUsd,
    valorActualUsd,
    noRealizadoUsd,
    retornoPct: p.costoTotalUsd > 0 ? (noRealizadoUsd / p.costoTotalUsd) * 100 : null,
  };
}

/**
 * Detecta que la tenencia informada por el broker no coincide con la que sale
 * del libro. Es la señal de que falta cargar algo: una compra, o un cambio de
 * ratio. Preferimos avisar antes que mostrar con confianza un numero mal.
 */
export function discrepancias(
  posiciones: Posicion[], tenenciasReales: { activo: string; cantidad: number }[],
): { activo: string; segunLibro: number; segunBroker: number; mensaje: string }[] {
  const libro = new Map(posiciones.map(p => [p.activo, p.cantidad]));
  const salida = [];

  for (const t of tenenciasReales) {
    const segunLibro = libro.get(t.activo) ?? 0;
    // Tolerancia relativa: las cripto tienen 8 decimales y siempre hay polvo.
    const tolerancia = Math.max(1e-6, Math.abs(t.cantidad) * 1e-4);
    if (Math.abs(segunLibro - t.cantidad) <= tolerancia) continue;

    const factor = segunLibro > 0 ? t.cantidad / segunLibro : 0;
    const pareceRatio = factor > 1.5 && Math.abs(factor - Math.round(factor)) < 0.01;

    salida.push({
      activo: t.activo,
      segunLibro,
      segunBroker: t.cantidad,
      mensaje: pareceRatio
        ? `El broker informa ${Math.round(factor)}x mas unidades de ${t.activo} que el libro. ` +
          `Puede ser un cambio de ratio o un split sin cargar: agregalo como evento con factor ${Math.round(factor)}.`
        : segunLibro === 0
          ? `Tenes ${t.activo} en el broker pero ninguna compra cargada, asi que no se puede calcular ganancia.`
          : `La cantidad de ${t.activo} no coincide: el libro dice ${segunLibro}, el broker ${t.cantidad}.`,
    });
  }
  return salida;
}
