import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

// Boveda de credenciales de brokers y exchanges.
//
// Cifrado sobre: el secreto se guarda cifrado en Postgres, y la clave que lo
// abre vive en una variable de entorno de Vercel. Quien se lleve un dump de la
// base no se lleva nada utilizable, que es exactamente el escenario que importa.
//
// AES-256-GCM y no AES-CBC: GCM autentica ademas de cifrar, asi que un
// ciphertext modificado falla al descifrar en vez de devolver basura silenciosa.
//
// Cada cifrado se ata a un CONTEXTO (el id de la conexion) via AAD. Sin eso,
// alguien con acceso de escritura a la base podria copiar el secreto cifrado de
// una fila a otra: mover las credenciales de IOL a una fila que dice "Binance,
// solo lectura" y hacer que la app las use creyendo otra cosa. Con AAD, el
// ciphertext solo abre en la fila para la que fue creado.

const ALGORITMO = 'aes-256-gcm';
const BYTES_CLAVE = 32;
const BYTES_IV = 12;   // 96 bits: el tamaño recomendado para GCM

export type Cifrado = {
  v: number;        // version de la clave maestra que lo cifro
  iv: string;       // base64
  tag: string;      // base64, tag de autenticacion GCM
  datos: string;    // base64
};

export class ErrorBoveda extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorBoveda';
  }
}

// Las claves se leen de BOVEDA_CLAVE_<n> y la vigente la indica
// BOVEDA_CLAVE_ACTUAL. Tener varias a la vez es lo que permite rotar sin perder
// las conexiones ya guardadas: se cifra con la nueva y se sigue pudiendo
// descifrar lo viejo hasta migrarlo.
function leerClave(version: number): Buffer {
  const bruto = process.env[`BOVEDA_CLAVE_${version}`];
  if (!bruto?.trim()) {
    throw new ErrorBoveda(
      `Falta la variable BOVEDA_CLAVE_${version} en el entorno. ` +
      'Generala con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const clave = Buffer.from(bruto.trim(), 'base64');
  if (clave.length !== BYTES_CLAVE) {
    throw new ErrorBoveda(
      `BOVEDA_CLAVE_${version} tiene ${clave.length} bytes y AES-256 necesita ${BYTES_CLAVE}. ` +
      'Tiene que ser base64 de 32 bytes aleatorios.',
    );
  }
  return clave;
}

export function versionActual(): number {
  const v = Number(process.env.BOVEDA_CLAVE_ACTUAL ?? 1);
  if (!Number.isInteger(v) || v < 1) {
    throw new ErrorBoveda(`BOVEDA_CLAVE_ACTUAL tiene que ser un entero mayor o igual a 1 (vino "${process.env.BOVEDA_CLAVE_ACTUAL}").`);
  }
  return v;
}

/**
 * Para que la UI pueda avisar antes de que la persona cargue una credencial,
 * en vez de fallar despues de escribirla.
 *
 * Devuelve el motivo y no solo un booleano: "falta la variable" y "la clave
 * tiene el largo equivocado" se arreglan distinto, y un cartel que dice
 * "falta" cuando en realidad esta mal pegada manda a buscar el problema al
 * lugar equivocado.
 */
export function estadoBoveda(): { ok: true } | { ok: false; motivo: string } {
  try {
    leerClave(versionActual());
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof ErrorBoveda ? e.message : String(e) };
  }
}

export function bovedaConfigurada(): boolean {
  return estadoBoveda().ok;
}

export function cifrar(valor: unknown, contexto: string): Cifrado {
  if (!contexto) throw new ErrorBoveda('El contexto es obligatorio: es lo que ata el secreto a su fila.');

  const v = versionActual();
  const iv = randomBytes(BYTES_IV);   // nunca reusar un IV con la misma clave
  const cipher = createCipheriv(ALGORITMO, leerClave(v), iv);
  cipher.setAAD(Buffer.from(contexto, 'utf8'));

  const datos = Buffer.concat([
    cipher.update(JSON.stringify(valor), 'utf8'),
    cipher.final(),
  ]);

  return {
    v,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    datos: datos.toString('base64'),
  };
}

export function descifrar<T>(c: Cifrado, contexto: string): T {
  if (!contexto) throw new ErrorBoveda('El contexto es obligatorio para descifrar.');
  if (!c?.iv || !c?.tag || !c?.datos) throw new ErrorBoveda('El secreto guardado esta incompleto.');

  const decipher = createDecipheriv(ALGORITMO, leerClave(c.v ?? 1), Buffer.from(c.iv, 'base64'));
  decipher.setAAD(Buffer.from(contexto, 'utf8'));
  decipher.setAuthTag(Buffer.from(c.tag, 'base64'));

  let plano: string;
  try {
    plano = Buffer.concat([
      decipher.update(Buffer.from(c.datos, 'base64')),
      decipher.final(),   // acá falla si el tag no valida
    ]).toString('utf8');
  } catch {
    // Sin detalles a proposito: distinguir "clave equivocada" de "dato alterado"
    // le sirve mas a quien esta probando ataques que a quien usa la app.
    throw new ErrorBoveda('No se pudo descifrar el secreto: la clave no corresponde o el dato fue alterado.');
  }
  return JSON.parse(plano) as T;
}

// Rotacion: descifra con la clave vieja y vuelve a cifrar con la vigente. El
// contexto no cambia, porque la fila sigue siendo la misma.
export function recifrar(c: Cifrado, contexto: string): Cifrado {
  return cifrar(descifrar(c, contexto), contexto);
}

// Los ultimos caracteres alcanzan para reconocer cual credencial es sin
// exponerla. Con menos de 8 no se muestra nada: preferible no dar ninguna pista
// a dar una que ayude a adivinar un secreto corto.
export function pista(secreto: string): string {
  return secreto.length >= 8 ? `••••${secreto.slice(-4)}` : '••••';
}

// Comparacion en tiempo constante, para chequeos de igualdad de secretos.
export function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
