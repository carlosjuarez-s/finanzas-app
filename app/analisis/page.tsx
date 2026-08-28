import { analizar } from '@/lib/analisis';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import { idUsuarioActual } from '@/lib/usuario';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, string> = {
  alta: 'var(--alerta)',
  media: 'var(--peso)',
  baja: 'var(--linea)',
};

export default async function Analisis() {
  const usuarioId = await idUsuarioActual();
  let hallazgos, analisis, motivo;
  try {
    ({ hallazgos, analisis, motivo } = await analizar(usuarioId));
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Analisis" />;
  }

  return (
    <main>
      <Nav />
      <p className="eyebrow">Analisis</p>
      <h1>Qué falta y qué conviene hacer</h1>

      {analisis && (
        <>
          <p style={{ fontSize: 17, margin: '16px 0' }}>{analisis.resumen}</p>

          {analisis.prioridades.length > 0 && (
            <section>
              <h2>Primero esto</h2>
              {analisis.prioridades.map((p, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: '1px dotted var(--linea)' }}>
                  <strong>{p.que}</strong>
                  <p className="resultado" style={{ margin: '4px 0 0' }}>{p.porque}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <section>
        <h2>
          Reconciliación
          {hallazgos.length > 0 && <span className="chip">{hallazgos.length}</span>}
        </h2>

        {!hallazgos.length && (
          <p className="resultado">
            No se detectaron huecos ni inconsistencias en los datos cargados.
          </p>
        )}

        {hallazgos.map(h => (
          <div key={h.id} style={{ padding: '12px 0', borderBottom: '1px dotted var(--linea)' }}>
            <div className="fila" style={{ border: 'none', padding: 0 }}>
              <span><strong>{h.titulo}</strong></span>
              <span className="chip" style={{ color: COLOR[h.severidad] }}>{h.severidad}</span>
            </div>
            <p className="resultado" style={{ margin: '4px 0 0' }}>{h.detalle}</p>
            {h.accion && (
              <p className="resultado" style={{ margin: '4px 0 0', color: 'var(--tinta)' }}>→ {h.accion}</p>
            )}
          </div>
        ))}

        <p className="nota">
          Estos hallazgos los calcula el sistema comparando tus datos, no los interpreta un
          modelo. Si dice que falta el recibo de agosto, es porque no está.
        </p>
      </section>

      {analisis?.observaciones?.length ? (
        <section>
          <h2>Además</h2>
          {analisis.observaciones.map((o, i) => (
            <div className="fila" key={i}><span>{o}</span></div>
          ))}
        </section>
      ) : null}

      {motivo && <p className="nota">{motivo}</p>}

      <p className="nota">
        El resumen y las prioridades los redacta un modelo a partir de los hallazgos y de
        tus totales mensuales — no de cada consumo, y con los datos personales censurados.
        No calcula montos nuevos: los números que ves salen del sistema.
      </p>
    </main>
  );
}
