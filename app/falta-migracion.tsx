import Nav from './nav';

export default function FaltaMigracion({ tabla, seccion }: { tabla: string; seccion: string }) {
  return (
    <main>
      <Nav />
      <p className="eyebrow">{seccion}</p>
      <h1>Falta correr la migración</h1>
      <p>
        La base todavía no tiene la tabla <code className="monto">{tabla}</code>, así que esta
        sección no puede cargar.
      </p>
      <p className="nota">
        Abrí el <strong>SQL Editor</strong> en console.neon.tech y pegá el contenido de{' '}
        <code className="monto">drizzle/0001_monthly_closes.sql</code> y{' '}
        <code className="monto">drizzle/0002_metas_y_supuestos.sql</code> del repo. Si alguna
        tabla ya existe, ese <code className="monto">CREATE TABLE</code> va a fallar: borrá ese
        bloque y corré el resto.
      </p>
    </main>
  );
}
