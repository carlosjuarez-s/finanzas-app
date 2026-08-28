import * as q from '@/lib/consultas';
import { mensajeDeError } from '@/lib/errores';

/**
 * El protocolo MCP, sin transporte ni autenticacion.
 *
 * Separado de la ruta a proposito: asi se puede probar el despacho entero
 * —initialize, tools/list, tools/call, los errores— sin base de datos y sin
 * levantar un servidor. La ruta se queda con lo suyo: leer el body, autenticar
 * y devolver el status HTTP que corresponde.
 *
 * No hay una sola herramienta que escriba. Un cliente conversacional no tiene
 * por que poder modificar tus finanzas, y que no pueda es mejor garantia que
 * acordarse de no pedirselo.
 */

const PROTOCOLO = '2025-06-18';

type Herramienta = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  correr: (usuarioId: string, args: Record<string, unknown>) => Promise<unknown>;
};

const texto = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
const entero = (v: unknown, def: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
const hoyISO = () => new Date().toISOString().slice(0, 10);

const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'resumen_del_mes',
    description:
      'Cierre de un mes: ingreso, gasto, ahorro, tasa de ahorro, percepciones y desglose por categoría. ' +
      'Los montos están en pesos argentinos. Usar cuando la pregunta es sobre un mes puntual.',
    inputSchema: {
      type: 'object',
      properties: { periodo: { type: 'string', description: 'Mes en formato YYYY-MM, por ejemplo 2026-08' } },
      required: ['periodo'],
    },
    correr: (u, a) => q.resumenDelMes(u, texto(a.periodo)),
  },
  {
    name: 'meses_cerrados',
    description:
      'Los últimos meses cerrados con ingreso, gasto, ahorro y tasa de ahorro. ' +
      'Usar para ver evolución o comparar meses entre sí.',
    inputSchema: {
      type: 'object',
      properties: { cuantos: { type: 'integer', description: 'Cuántos meses traer (1 a 60, por defecto 12)' } },
    },
    correr: (u, a) => q.mesesCerrados(u, entero(a.cuantos, 12)),
  },
  {
    name: 'buscar_consumos',
    description:
      'Busca consumos por texto en el comercio o la categoría, en tarjeta y en gastos sueltos. ' +
      'Devuelve las líneas y su total. Es la herramienta para "¿cuánto gasté en X?".',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Qué buscar, por ejemplo "supermercado" o "Netflix"' },
        desde: { type: 'string', description: 'Mes inicial YYYY-MM, opcional' },
        hasta: { type: 'string', description: 'Mes final YYYY-MM, opcional' },
        limite: { type: 'integer', description: 'Máximo de líneas (1 a 200, por defecto 50)' },
      },
      required: ['texto'],
    },
    correr: (u, a) => q.buscarConsumos(u, texto(a.texto), {
      desde: a.desde ? texto(a.desde) : undefined,
      hasta: a.hasta ? texto(a.hasta) : undefined,
      limite: a.limite === undefined ? undefined : entero(a.limite, 50),
    }),
  },
  {
    name: 'gasto_por_categoria',
    description:
      'Suma el gasto por categoría en un rango de meses, ordenado de mayor a menor. ' +
      'Usar para "¿en qué se me va la plata?".',
    inputSchema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Mes inicial YYYY-MM' },
        hasta: { type: 'string', description: 'Mes final YYYY-MM' },
      },
      required: ['desde', 'hasta'],
    },
    correr: (u, a) => q.gastoPorCategoria(u, texto(a.desde), texto(a.hasta)),
  },
  {
    name: 'portafolio',
    description:
      'Tenencias por plataforma con su valuación en dólares, y cuántas operaciones hay cargadas. ' +
      'Los valores son los de la última sincronización, no cotización en vivo.',
    inputSchema: { type: 'object', properties: {} },
    correr: u => q.portafolio(u),
  },
  {
    name: 'compromisos',
    description:
      'Deudas en las dos direcciones: cuotas de créditos que hay que pagar, y plata prestada a personas ' +
      'que todavía no devolvieron.',
    inputSchema: { type: 'object', properties: {} },
    correr: u => q.compromisos(u, hoyISO()),
  },
  {
    name: 'metas',
    description: 'Metas de ahorro activas, con su monto objetivo, moneda y fecha.',
    inputSchema: { type: 'object', properties: {} },
    correr: u => q.metas(u),
  },
];


export type Respuesta =
  | { tipo: 'resultado'; result: unknown }
  | { tipo: 'error'; code: number; message: string; status?: number }
  | { tipo: 'sin-contenido' };

export const nombresDeHerramientas = () => HERRAMIENTAS.map(h => h.name);

/** Despacha un pedido JSON-RPC ya autenticado. */
export async function despachar(
  usuarioId: string,
  pedido: { jsonrpc?: unknown; method?: unknown; params?: Record<string, unknown> } | null,
): Promise<Respuesta> {
  if (pedido?.jsonrpc !== '2.0' || typeof pedido.method !== 'string') {
    return { tipo: 'error', code: -32600, message: 'Pedido JSON-RPC inválido.', status: 400 };
  }

  switch (pedido.method) {
    case 'initialize':
      return { tipo: 'resultado', result: {
        protocolVersion: PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: 'finanzas', version: '1.0.0' },
      } };

    // Notificacion: el protocolo dice que no lleva respuesta.
    case 'notifications/initialized':
      return { tipo: 'sin-contenido' };

    case 'ping':
      return { tipo: 'resultado', result: {} };

    case 'tools/list':
      return { tipo: 'resultado', result: {
        tools: HERRAMIENTAS.map(({ name, description, inputSchema }) => ({
          name, description, inputSchema,
        })),
      } };

    case 'tools/call': {
      const nombre = pedido.params?.name;
      const h = HERRAMIENTAS.find(x => x.name === nombre);
      if (!h) return { tipo: 'error', code: -32602, message: `No existe la herramienta "${nombre}".` };

      try {
        const salida = await h.correr(usuarioId, (pedido.params?.arguments as Record<string, unknown>) ?? {});
        return { tipo: 'resultado', result: {
          content: [{ type: 'text', text: JSON.stringify(salida, null, 2) }],
        } };
      } catch (e) {
        // isError y no un error de protocolo: el modelo tiene que poder leer
        // "el periodo estaba mal" y corregir, no cortar la conversacion.
        return { tipo: 'resultado', result: {
          isError: true,
          content: [{ type: 'text', text: mensajeDeError(e) }],
        } };
      }
    }

    default:
      return { tipo: 'error', code: -32601, message: `Método no soportado: ${pedido.method}` };
  }
}
