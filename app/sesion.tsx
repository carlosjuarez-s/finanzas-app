import { auth, signOut, ssoConfigurado } from '@/auth';

/**
 * Quien esta adentro y como salir. Con Basic Auth no hay nada que mostrar: el
 * navegador guarda la credencial y no existe un "cerrar sesion".
 */
export default async function Sesion() {
  if (!ssoConfigurado) return null;

  const sesion = await auth();
  if (!sesion?.user) return null;

  return (
    <div className="sesion">
      <span className="resultado">{sesion.user.email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button type="submit" className="salir">Salir</button>
      </form>
    </div>
  );
}
