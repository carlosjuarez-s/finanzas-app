// Registro de plataformas conectables.
//
// `lecturaGarantizadaPorLaPlataforma` es el dato central del plan: distingue
// una credencial que NO PUEDE operar aunque se filtre (Binance, con una API key
// de solo lectura) de una que puede hacer todo y solo esta limitada por nuestro
// codigo (IOL, que pide usuario y contraseña de la cuenta).
//
// Vive acá y no como columna de `conexiones` a proposito: es una propiedad de la
// plataforma, no de cada conexion. Guardarlo por fila abre la puerta a que una
// diga "solo lectura" porque quedo mal escrito alguna vez.

export type PlataformaId = 'BINANCE' | 'IOL';

export type CampoCredencial = {
  nombre: string;          // clave dentro del secreto cifrado
  etiqueta: string;
  tipo: 'texto' | 'password';
  ayuda?: string;
};

export type Plataforma = {
  id: PlataformaId;
  nombre: string;
  lecturaGarantizadaPorLaPlataforma: boolean;
  /** Qué implica para la persona que conecta. Se muestra tal cual en la UI. */
  advertencia: string;
  campos: CampoCredencial[];
  /** Cuál de los campos se usa para la pista visible (••••4f2a). */
  campoPista: string;
};

export const PLATAFORMAS: Record<PlataformaId, Plataforma> = {
  BINANCE: {
    id: 'BINANCE',
    nombre: 'Binance',
    lecturaGarantizadaPorLaPlataforma: true,
    advertencia:
      'Creá la API key con permiso de solo lectura ("Enable Reading") y sin habilitar trading ' +
      'ni retiros. Así, aunque la clave se filtre, no puede operar tu cuenta. ' +
      'Ojo: Binance vence las claves sin restricción de IP a los 30 días, así que cada tanto ' +
      'vas a tener que generar una nueva.',
    campos: [
      { nombre: 'apiKey', etiqueta: 'API Key', tipo: 'texto' },
      { nombre: 'apiSecret', etiqueta: 'API Secret', tipo: 'password', ayuda: 'Binance lo muestra una sola vez, al crear la clave.' },
    ],
    campoPista: 'apiKey',
  },

  IOL: {
    id: 'IOL',
    nombre: 'InvertirOnline',
    lecturaGarantizadaPorLaPlataforma: false,
    advertencia:
      'IOL no ofrece claves de solo lectura: su API pide el usuario y la contraseña con los que ' +
      'entrás a la web, y esas credenciales permiten operar. Que esta app no opere lo garantiza ' +
      'únicamente su código, no la plataforma. Si la base de datos se filtrara, quien la lea ' +
      'tendría acceso completo a tu cuenta.',
    campos: [
      { nombre: 'usuario', etiqueta: 'Usuario', tipo: 'texto' },
      { nombre: 'password', etiqueta: 'Contraseña', tipo: 'password' },
    ],
    campoPista: 'usuario',
  },
};

export const esPlataforma = (v: unknown): v is PlataformaId =>
  typeof v === 'string' && v in PLATAFORMAS;

export const listaPlataformas = () => Object.values(PLATAFORMAS);
