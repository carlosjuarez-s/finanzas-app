import { listarConexiones, leerCredencial, marcarError } from './conexiones';
import { tenencias, pares, paresDeInteres, tradesDe, type CredencialBinance, type TradeBinance } from './binance';
import { mapearTrades, type OmitidaBinance } from './historial-binance';
import { guardarMovimientos } from './guardar';
import { errorCensurado } from './secretos';

/**
 * Importa el historial de operaciones de Binance al libro de transacciones.
 *
 * Es lo que convierte el portafolio de una foto en un resultado: con las
 * tenencias sabes cuanto tenes, con las operaciones sabes cuanto pagaste.
 *
 * myTrades exige un simbolo por pedido, asi que hay que preguntar par por par.
 * Se consultan solo los pares en dolares de los activos que efectivamente
 * tenes: pedir los ~3000 del exchange gastaria el rate limit sin ganar nada.
 */

export type ResultadoImportacion = {
  conexion: string;
  estado: 'ok' | 'error';
  detalle: string;
  nuevas?: number;
  repetidas?: number;
  omitidas?: OmitidaBinance[];
  comisionesNoUsd?: number;
};

// Cada myTrades pesa 20 de las 6000 unidades por minuto que da Binance. El tope
// deja mucho margen y evita que una cuenta con muchos activos se quede colgada.
const MAX_PARES = 60;

export async function importarHistorial(): Promise<ResultadoImportacion[]> {
  const salida: ResultadoImportacion[] = [];

  for (const c of await listarConexiones()) {
    if (c.plataforma !== 'BINANCE') continue;
    if (c.estado === 'VENCIDA') {
      salida.push({ conexion: c.etiqueta, estado: 'error', detalle: 'La credencial esta marcada como vencida: actualizala.' });
      continue;
    }

    let cred: CredencialBinance | undefined;
    try {
      cred = await leerCredencial<CredencialBinance>(c.id);

      const [saldos, catalogo] = await Promise.all([tenencias(cred), pares()]);
      const aConsultar = paresDeInteres(saldos.map(s => s.activo), catalogo);

      if (!aConsultar.length) {
        salida.push({ conexion: c.etiqueta, estado: 'ok', detalle: 'No hay pares en dolares para los activos de esta cuenta.' });
        continue;
      }

      const recortado = aConsultar.slice(0, MAX_PARES);
      const trades: TradeBinance[] = [];
      for (const p of recortado) {
        // Secuencial y no en paralelo: Binance banea por exceso de pedidos, y
        // un import que deja la clave bloqueada es peor que uno lento.
        trades.push(...await tradesDe(cred, p.simbolo));
      }

      const { movimientos, omitidas, comisionesNoUsd } = mapearTrades(trades, catalogo);
      const { nuevos, repetidos } = await guardarMovimientos(movimientos, 'BINANCE');

      const partes = [`${nuevos} ${nuevos === 1 ? 'operacion nueva' : 'operaciones nuevas'}`];
      if (repetidos) partes.push(`${repetidos} ya estaban`);
      if (aConsultar.length > recortado.length) {
        partes.push(`solo se miraron ${recortado.length} de ${aConsultar.length} pares`);
      }

      salida.push({
        conexion: c.etiqueta, estado: 'ok', detalle: partes.join(' · '),
        nuevas: nuevos, repetidas: repetidos, omitidas, comisionesNoUsd,
      });
    } catch (e) {
      const secretos = cred ? [cred.apiKey, cred.apiSecret] : [];
      await marcarError(c.id, e, secretos);
      salida.push({ conexion: c.etiqueta, estado: 'error', detalle: errorCensurado(e, secretos) });
    }
  }

  if (!salida.length) {
    salida.push({ conexion: '—', estado: 'error', detalle: 'No hay ninguna conexion de Binance cargada.' });
  }
  return salida;
}
