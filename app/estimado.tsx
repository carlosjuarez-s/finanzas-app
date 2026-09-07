import Link from 'next/link';
import { fmtArs, fmtPeriodo } from '@/lib/formato';
import type { Estimacion } from '@/lib/estimacion';
import StackedBar from './stacked-bar';
import Monto from './monto';

// La misma paleta validada de la pantalla de estimacion. El orden codifica
// confianza: comprometido primero, variable ultimo.
// Solo las dos que entran al total. La referencia no se grafica acá: pintarla
// del mismo tamaño la haria parecer parte del numero, que es justo lo que se
// decidio que no sea.
const PARTES = [
  { clave: 'comprometidoArs', etiqueta: 'Cuotas', color: '#B4690E' },
  { clave: 'fijoArs', etiqueta: 'Fijos', color: '#6B4E9E' },
] as const;

/**
 * El mes que todavia no cerro, estimado.
 *
 * Un cierre son datos reales de un mes que ya paso. El mes en curso no los
 * tiene todos —recien los vas cargando— y hasta ahora la pantalla mostraba lo
 * poco que hubiera como si fuera el mes entero: un mes con dos gastos cargados
 * se veia como un mes de ahorro altisimo.
 *
 * El numero grande es **lo que sale si o si**: cuotas mas gastos fijos. Es un
 * piso, no un pronostico. Lo que el historial dice que ademas se gasta va
 * abajo, mas chico y con otro nombre: es lo unico del calculo que nadie
 * afirmo, y mezclarlo convertia un compromiso verificable en una adivinanza.
 *
 * Esto **no se guarda**. Se calcula al vuelo cada vez, y se muestra separado
 * de lo cargado para que no haya forma de confundir uno con otro.
 */
export default function Estimado({ e, periodo, cargadoArs, hayDatos }: {
  e: Estimacion;
  periodo: string;
  /** Lo que ya esta cargado de este mes, para poder contrastar. */
  cargadoArs: number | null;
  hayDatos: boolean;
}) {
  const partes = PARTES
    .map(p => ({ etiqueta: p.etiqueta, valor: e[p.clave], color: p.color }))
    .filter(p => p.valor > 0);

  // Cuanto de lo estimado ya entro. Mas de 100% no es un error: significa que
  // el mes viene mas caro de lo que se estimo, que es informacion.
  const avance = cargadoArs !== null && e.totalArs > 0
    ? Math.round((cargadoArs / e.totalArs) * 100)
    : null;

  return (
    <section className="estimado">
      <h2>
        Estimado para {fmtPeriodo(periodo)}
        <span className="chip">no es un cierre</span>
      </h2>

      <div className="ledger">
        <div className="celda">
          <p className="eyebrow">Sale sí o sí</p>
          <p className="valor ars">{fmtArs(e.totalArs)}</p>
          {avance !== null && (
            <p className="monto" style={{ fontSize: 12 }}>
              llevás {fmtArs(cargadoArs ?? 0)} cargado{avance > 0 && ` · ${avance}%`}
            </p>
          )}
        </div>
        <div className="op">−</div>
        <div className="celda">
          <p className="eyebrow">Sobre un ingreso de</p>
          <p className="valor ars">
            {e.ingresoReferenciaArs === null ? '—' : fmtArs(e.ingresoReferenciaArs)}
          </p>
          {e.periodoDelIngreso && (
            <p className="monto" style={{ fontSize: 12 }}>
              el sueldo de {fmtPeriodo(e.periodoDelIngreso)}
            </p>
          )}
        </div>
        <div className="op">=</div>
        <div className="celda">
          <p className="eyebrow">Te quedarían</p>
          <p className="valor"><Monto valor={e.ahorroEstimadoArs} /></p>
        </div>
      </div>

      {partes.length > 0 && <StackedBar partes={partes} total={e.totalArs} formato="ars" />}

      {/* La referencia va abajo y aparte. Sumarla al total convertia un
          compromiso en un pronostico; esconderla dejaba a alguien planificando
          con un piso creyendo que era el techo. */}
      {e.referenciaArs > 0 && (
        <div className="referencia">
          <p className="eyebrow">Además, mirando tu historial</p>
          <p>
            En los últimos {e.mesesUsados} {e.mesesUsados === 1 ? 'mes' : 'meses'} gastaste{' '}
            <strong className="monto ars">{fmtArs(e.referenciaArs)}</strong> por fuera de los
            fijos. Sumándolo, el mes probablemente termine en{' '}
            <strong className="monto ars">{fmtArs(e.probableArs)}</strong>.
          </p>
          <p className="nota">
            Esto no entra en el número de arriba: es lo único del cálculo que nadie declaró.
          </p>
        </div>
      )}

      {/* El sueldo es un supuesto, no un dato: hay que poder ir a corregirlo
          sin salir a buscar donde. */}
      <p className="nota">
        El ingreso es el último sueldo que cargaste, sin proyectar aumentos: inventar una
        paritaria sería agregarle un error propio a una estimación que ya tiene el suyo.{' '}
        <Link href={`/gastos?periodo=${periodo}`}>Ajustalo</Link> y este número cambia.
      </p>

      {!hayDatos && (
        <p className="nota">
          Todavía no cargaste nada de este mes. Cuando entren el resumen y los gastos, esta
          sección sigue estando pero el cierre de arriba pasa a ser el número real.
        </p>
      )}

      {e.advertencias.map(a => (
        <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }} key={a}>{a}</p>
      ))}
    </section>
  );
}
