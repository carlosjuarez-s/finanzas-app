import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { listaDeEmails, permitido } from '@/lib/auth';

/**
 * Con Google configurado la app entra por SSO. Sin configurar sigue el Basic
 * Auth de siempre: el deploy que ya funciona no se cae por agregar esto.
 */
export const ssoConfigurado = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: ssoConfigurado ? [Google] : [],
  // Sesion en JWT: sin adaptador de base no hay tabla de sesiones que migrar,
  // y el middleware puede leerla en el Edge sin consultar Postgres.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ profile }) {
      return permitido(profile?.email, profile?.email_verified, listaDeEmails(process.env.AUTH_EMAILS));
    },
  },
  // Vercel lo infiere solo, pero los deploys de preview cambian de host y sin
  // esto Auth.js los rechaza.
  trustHost: true,
});
