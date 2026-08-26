import { NextRequest, NextResponse } from 'next/server';
import { auth, ssoConfigurado } from './auth';
import { listaDeEmails, enLaLista } from './lib/auth';

// Datos financieros personales: nada es publico salvo lo que necesita el propio
// login. /api/sync tiene su CRON_SECRET, que es lo que usa el cron de Vercel.
const ABIERTAS = ['/api/auth', '/login', '/api/sync'];
const abierta = (p: string) => ABIERTAS.some(a => p === a || p.startsWith(a + '/'));

/** Basic Auth: lo que habia antes del SSO, y lo que queda si Google no esta configurado. */
function basico(req: NextRequest) {
  // btoa y no Buffer: esto corre en el Edge.
  const esperado = 'Basic ' + btoa(`carlos:${process.env.APP_PASSWORD}`);
  if (req.headers.get('authorization') === esperado) return NextResponse.next();
  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="finanzas"' },
  });
}

const conSso = auth(req => {
  const { pathname } = req.nextUrl;

  // La lista blanca se vuelve a chequear en cada request y no solo al loguearse:
  // si se saca un email de AUTH_EMAILS, la sesion que ya existia deja de servir
  // en el siguiente request en vez de sobrevivir hasta que venza el token.
  if (req.auth?.user && enLaLista(req.auth.user.email, listaDeEmails(process.env.AUTH_EMAILS))) {
    return NextResponse.next();
  }

  const url = new URL('/login', req.nextUrl.origin);
  if (pathname !== '/') url.searchParams.set('volver', pathname);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ctx: unknown) {
  if (abierta(req.nextUrl.pathname)) return NextResponse.next();
  if (!ssoConfigurado) return basico(req);
  return (conSso as unknown as (r: NextRequest, c: unknown) => Response | Promise<Response>)(req, ctx);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
