import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { salaries, statements, gastos, monthlyCloses, conexiones } from '@/db/schema';

/**
 * Que le falta a una cuenta recien creada.
 *
 * La app abria vacia en el cierre y no decia por donde empezar. Para el dueño
 * original eso no se nota —ya sabe el orden— pero alguien nuevo ve nueve
 * secciones vacias y ninguna pista.
 *
 * Los pasos estan en orden de dependencia real, no de importancia: sin un
 * ingreso cargado la tasa de ahorro no existe, y sin un gasto el cierre no
 * tiene nada que cerrar.
 */

export type Paso = {
  id: string;
  titulo: string;
  detalle: string;
  href: string;
  hecho: boolean;
};

export type Arranque = {
  pasos: Paso[];
  /** True cuando no hay absolutamente nada: es una cuenta que recien nace. */
  vacia: boolean;
  completos: number;
};

const cuantos = async (tabla: typeof salaries | typeof statements | typeof gastos | typeof monthlyCloses | typeof conexiones, usuarioId: string) => {
  const [f] = await db.select({ n: sql<number>`count(*)::int` }).from(tabla)
    .where(eq(tabla.usuarioId, usuarioId));
  return f?.n ?? 0;
};

export async function primerosPasos(usuarioId: string): Promise<Arranque> {
  const [sueldos, resumenes, sueltos, cierres, conex] = await Promise.all([
    cuantos(salaries, usuarioId),
    cuantos(statements, usuarioId),
    cuantos(gastos, usuarioId),
    cuantos(monthlyCloses, usuarioId),
    cuantos(conexiones, usuarioId),
  ]);

  const pasos: Paso[] = [
    {
      id: 'ingreso',
      titulo: 'Cargá un ingreso',
      detalle: 'Subí un recibo de sueldo, o anotá cuánto entró. Sin esto no hay tasa de ahorro: ' +
        'la app puede decirte cuánto gastaste, pero no si te alcanzó.',
      href: '/',
      hecho: sueldos > 0,
    },
    {
      id: 'gasto',
      titulo: 'Cargá un gasto',
      detalle: 'Un resumen de tarjeta, una boleta, o escribilo: «pagué 85 lucas de alquiler». ' +
        'El modelo lo interpreta y lo clasifica.',
      href: '/gastos',
      hecho: resumenes + sueltos > 0,
    },
    {
      id: 'categorias',
      titulo: 'Revisá tus categorías',
      detalle: 'Las que vienen son un punto de partida, no una ley. Ajustalas a tus rubros ' +
        'antes de cargar mucho: cambian cómo se clasifica de ahí en adelante.',
      href: '/gastos',
      // Se da por hecho con el primer gasto: recien ahi se ve si sirven.
      hecho: resumenes + sueltos > 0,
    },
    {
      id: 'cierre',
      titulo: 'Cerrá tu primer mes',
      detalle: 'Con un ingreso y un gasto del mismo mes ya hay cierre. De ahí salen el ' +
        'histórico, la estimación y todo lo demás.',
      href: '/historico',
      hecho: cierres > 0,
    },
    {
      id: 'inversiones',
      titulo: 'Conectá tus inversiones',
      detalle: 'Opcional. Si tenés cripto o acciones, la app puede traer las tenencias sola ' +
        'y calcular tu resultado.',
      href: '/conexiones',
      hecho: conex > 0,
    },
  ];

  return {
    pasos,
    vacia: sueldos + resumenes + sueltos + cierres === 0,
    completos: pasos.filter(p => p.hecho).length,
  };
}
