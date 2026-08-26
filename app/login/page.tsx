import { signIn, ssoConfigurado } from '@/auth';
import { listaDeEmails } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Auth.js manda su propio codigo de error por query. Traducidos, porque
// "OAuthAccountNotLinked" no le dice nada a nadie.
const MOTIVOS: Record<string, string> = {
  AccessDenied: 'Esa cuenta de Google no está habilitada para entrar acá.',
  Verification: 'El enlace ya se usó o venció. Probá de nuevo.',
  Configuration: 'El login con Google está mal configurado del lado del servidor.',
};

export default async function Login({ searchParams }: {
  searchParams: Promise<{ error?: string; volver?: string }>;
}) {
  const { error, volver } = await searchParams;
  const habilitados = listaDeEmails(process.env.AUTH_EMAILS).length;

  return (
    <main>
      <p className="eyebrow">Finanzas</p>
      <h1>Entrar</h1>

      {error && (
        <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
          {MOTIVOS[error] ?? `No se pudo entrar (${error}).`}
        </p>
      )}

      {!ssoConfigurado ? (
        <p className="resultado">
          El login con Google no está configurado. Falta <code>AUTH_GOOGLE_ID</code> y{' '}
          <code>AUTH_GOOGLE_SECRET</code>; mientras tanto la app pide usuario y contraseña.
        </p>
      ) : habilitados === 0 ? (
        <p className="nota" style={{ borderLeftColor: 'var(--alerta)' }}>
          No hay ningún email habilitado: <code>AUTH_EMAILS</code> está vacía y así no entra
          nadie. Es a propósito — una lista vacía niega, no permite.
        </p>
      ) : (
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: volver && volver.startsWith('/') ? volver : '/' });
          }}
        >
          <button type="submit" className="boton-google">
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Entrar con Google
          </button>
        </form>
      )}

      <p className="nota">
        Solo entran las cuentas que estén en la lista. Tener una cuenta de Google no alcanza:
        acá adentro están tus gastos, tu sueldo y tu portafolio.
      </p>
    </main>
  );
}
