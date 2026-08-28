import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transacciones, eventosActivo } from '@/db/schema';
import { listarConexiones, leerCredencial, marcarError, marcarSync } from './conexiones';
import { tenencias, preciosUsdt, type CredencialBinance } from './binance';
import { guardarPortfolio } from './guardar';
import { calcularPosiciones, conPrecio, discrepancias, type Transaccion, type EventoActivo, type Resultado } from './costo';
import { errorCensurado } from './secretos';

export type ResultadoSync = {
  conexion: string;
  plataforma: string;
  estado: 'ok' | 'error';
  detalle: string;
};

/**
 * Trae las tenencias de cada conexion activa y las guarda como snapshot del
 * periodo. Reusa las tablas que ya llenaban las capturas, asi el historico y
 * las metas siguen funcionando sin cambios.
 */
export async function sincronizarPortafolio(usuarioId: string, periodo?: string): Promise<ResultadoSync[]> {
  const mes = periodo ?? new Date().toISOString().slice(0, 7);
  const salida: ResultadoSync[] = [];

  for (const c of await listarConexiones(usuarioId)) {
    if (c.estado === 'VENCIDA') {
      salida.push({ conexion: c.etiqueta, plataforma: c.nombrePlataforma, estado: 'error', detalle: 'La credencial esta marcada como vencida: actualizala.' });
      continue;
    }
    if (c.plataforma !== 'BINANCE') {
      salida.push({ conexion: c.etiqueta, plataforma: c.nombrePlataforma, estado: 'error', detalle: 'Todavia no esta implementada la sincronizacion de esta plataforma.' });
      continue;
    }

    let cred: CredencialBinance | undefined;
    try {
      cred = await leerCredencial<CredencialBinance>(usuarioId, c.id);
      const saldos = await tenencias(cred);

      if (!saldos.length) {
        await marcarSync(usuarioId, c.id);
        salida.push({ conexion: c.etiqueta, plataforma: c.nombrePlataforma, estado: 'ok', detalle: 'La cuenta no tiene saldos.' });
        continue;
      }

      const precios = await preciosUsdt(saldos.map(s => s.activo));
      const totalUsd = saldos.reduce((s, t) => s + (precios[t.activo] ?? 0) * t.cantidad, 0);

      await guardarPortfolio(usuarioId, mes, {
        plataforma: c.nombrePlataforma,
        totalUsd,
        totalArs: null,
        positions: saldos.map(t => ({
          activo: t.activo,
          clase: 'CRIPTO',
          cantidad: t.cantidad,
          valorUsd: precios[t.activo] != null ? precios[t.activo] * t.cantidad : null,
          valorArs: null,
        })),
      });

      await marcarSync(usuarioId, c.id);
      const sinPrecio = saldos.filter(s => precios[s.activo] == null).length;
      salida.push({
        conexion: c.etiqueta, plataforma: c.nombrePlataforma, estado: 'ok',
        detalle: `${saldos.length} activos` + (sinPrecio ? ` · ${sinPrecio} sin cotizacion contra USDT` : ''),
      });
    } catch (e) {
      // La credencial va en la lista de secretos a censurar: el error de la API
      // puede traerla en el texto y esto se guarda en la base.
      const secretos = cred ? [cred.apiKey, cred.apiSecret] : [];
      await marcarError(usuarioId, c.id, e, secretos);
      salida.push({
        conexion: c.etiqueta, plataforma: c.nombrePlataforma, estado: 'error',
        detalle: errorCensurado(e, secretos),
      });
    }
  }
  return salida;
}

/** Posiciones del libro con su cotizacion, y lo que no cierra contra el broker. */
export async function resultadosPorActivo(usuarioId: string, precios: Record<string, number> = {}): Promise<{
  resultados: Resultado[];
  errores: string[];
}> {
  const [txs, evs] = await Promise.all([
    db.select().from(transacciones).where(eq(transacciones.usuarioId, usuarioId)),
    db.select().from(eventosActivo).where(eq(eventosActivo.usuarioId, usuarioId)),
  ]);

  const libro: Transaccion[] = txs.map(t => ({
    activo: t.activo,
    tipo: t.tipo as 'COMPRA' | 'VENTA',
    fecha: t.fecha,
    cantidad: Number(t.cantidad),
    precioUnitario: Number(t.precioUnitario),
    moneda: t.moneda as 'ARS' | 'USD',
    tipoCambioDia: t.tipoCambioDia === null ? null : Number(t.tipoCambioDia),
    comision: Number(t.comision),
  }));

  const eventos: EventoActivo[] = evs.map(e => ({
    activo: e.activo,
    fecha: e.fecha,
    tipo: e.tipo as EventoActivo['tipo'],
    factor: Number(e.factor),
  }));

  const errores: string[] = [];
  const resultados: Resultado[] = [];

  // Un activo con el libro inconsistente no puede tumbar el resto de la
  // pantalla: se reporta y se sigue.
  for (const activo of [...new Set(libro.map(t => t.activo))].sort()) {
    try {
      const [p] = calcularPosiciones(libro.filter(t => t.activo === activo), eventos);
      resultados.push(conPrecio(p, precios[activo] ?? null));
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { resultados, errores };
}

export { discrepancias };

/**
 * Ratio vigente de cada CEDEAR, acumulando los eventos cargados. Se usa para
 * valuar: un CEDEAR vale el precio de la accion dividido por su ratio.
 *
 * Arranca en 1 y multiplica por cada factor, que es la misma cuenta que ajusta
 * el costo de entrada. Si no hay eventos cargados para un activo, queda 1:1 y
 * el valor va a estar mal — por eso conviene cargar el ratio real como evento
 * inicial cuando se carga la primera compra de un CEDEAR.
 */
export async function ratiosVigentes(usuarioId: string): Promise<Record<string, number>> {
  const evs = await db.select().from(eventosActivo)
    .where(eq(eventosActivo.usuarioId, usuarioId));
  const salida: Record<string, number> = {};
  for (const e of evs) {
    const f = Number(e.factor);
    if (Number.isFinite(f) && f > 0) salida[e.activo] = (salida[e.activo] ?? 1) * f;
  }
  return salida;
}

/** Clase de cada activo, segun como se cargo en el libro. */
export async function clasesDeActivos(usuarioId: string): Promise<{ activo: string; clase: string }[]> {
  const filas = await db.selectDistinct({ activo: transacciones.activo, clase: transacciones.clase })
    .from(transacciones).where(eq(transacciones.usuarioId, usuarioId));
  return filas;
}
