import { listarConexiones } from '@/lib/conexiones';
import { estadoBoveda } from '@/lib/boveda';
import { tablaFaltante } from '@/lib/errores';
import Nav from '../nav';
import FaltaMigracion from '../falta-migracion';
import Panel from './panel';
import { idUsuarioActual } from '@/lib/usuario';

export const dynamic = 'force-dynamic';

export default async function Conexiones() {
  const usuarioId = await idUsuarioActual();
  const boveda = estadoBoveda();
  let conexiones;
  try {
    conexiones = await listarConexiones(usuarioId);
  } catch (e) {
    const tabla = tablaFaltante(e);
    if (!tabla) throw e;
    return <FaltaMigracion tabla={tabla} seccion="Conexiones" />;
  }

  return (
    <main>
      <Nav />
      <p className="eyebrow">Conexiones</p>
      <h1>Cuentas de inversión</h1>
      <p className="resultado">
        Las credenciales se guardan cifradas y la clave que las abre vive fuera de la base
        de datos. Esta app nunca opera: solo lee tenencias.
      </p>
      <Panel
        conexiones={conexiones}
        bovedaLista={boveda.ok}
        motivoBoveda={boveda.ok ? undefined : boveda.motivo}
      />
    </main>
  );
}
