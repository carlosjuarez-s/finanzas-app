import { neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

// Driver HTTP de Neon: sin pool ni binarios, ideal para serverless.
// Lazy via Proxy: el build de Next evalua los modulos y no debe exigir DATABASE_URL.
type DB = NeonHttpDatabase<typeof schema>;
let _db: DB | undefined;

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    _db ??= drizzle(neon(process.env.DATABASE_URL!), { schema });
    return (_db as never)[prop];
  },
});
