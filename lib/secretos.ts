// Censura de credenciales en texto que va a quedar guardado o mostrado.
//
// El caso concreto: Binance firma los pedidos con la API key en un header y la
// firma en el query string. Cuando algo falla, el mensaje de error suele traer
// la URL completa. Si ese texto va a `conexiones.ultimo_error` o a un log, la
// credencial queda archivada en claro, y encima en un lugar donde nadie la
// busca.
//
// Se censura por dos caminos que se complementan:
//   1. Por valor conocido: sabemos cual es el secreto, se reemplaza donde
//      aparezca. Es el mas confiable.
//   2. Por patron: para lo que no conocemos de antemano — un token que devolvio
//      la API, la contraseña dentro de un body que se reintenta.
//
// Igual que con la redaccion de PII, el riesgo no es solo dejar pasar algo: es
// sobre-censurar y volver el error inservible para diagnosticar. Por eso los
// valores conocidos se censuran desde 8 caracteres (mas corto es demasiado
// probable que sea una palabra comun) y los patrones estan anclados a su
// etiqueta.

const LARGO_MINIMO = 8;

// Anclados a la etiqueta: un valor suelto largo puede ser un id de operacion,
// un hash de transaccion o un ISIN, y censurarlos arruina el diagnostico.
const PATRONES: { re: RegExp; reemplazo: string }[] = [
  // Headers de autenticacion.
  { re: /(X-MBX-APIKEY\s*:\s*)\S+/gi, reemplazo: '$1[SECRETO]' },
  { re: /(Authorization\s*:\s*(?:Bearer|Basic)\s+)\S+/gi, reemplazo: '$1[SECRETO]' },
  // Parametros en query string o body.
  { re: /\b(api[_-]?key|apisecret|api[_-]?secret|secret|signature|password|passwd|refresh[_-]?token|access[_-]?token|token)\s*[=:]\s*"?[\w.\-+/=]{6,}"?/gi,
    reemplazo: '$1=[SECRETO]' },
  // JSON: "password": "loquesea"
  { re: /("(?:api[_-]?key|api[_-]?secret|secret|signature|password|refresh_token|access_token|token)"\s*:\s*)"[^"]{4,}"/gi,
    reemplazo: '$1"[SECRETO]"' },
];

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Censura credenciales en un texto.
 * @param secretos valores conocidos (api key, secret, contraseña) a borrar donde aparezcan.
 */
export function censurarSecretos(texto: string, secretos: string[] = []): string {
  let salida = texto;

  // Primero los valores conocidos: mas largos antes, para que un secreto que
  // contiene a otro como prefijo no quede a medio censurar.
  const conocidos = secretos
    .filter(s => typeof s === 'string' && s.length >= LARGO_MINIMO)
    .sort((a, b) => b.length - a.length);

  for (const s of conocidos) {
    salida = salida.replace(new RegExp(escaparRegex(s), 'g'), '[SECRETO]');
  }

  for (const { re, reemplazo } of PATRONES) {
    salida = salida.replace(re, reemplazo);
  }
  return salida;
}

/**
 * Mensaje de un error, ya censurado. Es lo unico que deberia guardarse en
 * `conexiones.ultimo_error` o mandarse al navegador.
 */
export function errorCensurado(e: unknown, secretos: string[] = []): string {
  const mensaje = e instanceof Error ? e.message : String(e);
  return censurarSecretos(mensaje, secretos);
}
