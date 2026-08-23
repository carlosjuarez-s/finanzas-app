import { NextRequest, NextResponse } from 'next/server';

// Proteccion simple con Basic Auth: datos financieros personales.
// Corre en Edge: usar btoa, no Buffer.
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/sync')) return NextResponse.next(); // usa CRON_SECRET propio
  const auth = req.headers.get('authorization');
  const expected = 'Basic ' + btoa(`carlos:${process.env.APP_PASSWORD}`);
  if (auth === expected) return NextResponse.next();
  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="finanzas"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
