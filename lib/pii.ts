// Redaccion de datos personales antes de que salgan hacia el proveedor de IA, y
// antes de guardar lo que el modelo devuelve.
//
// ALCANCE REAL — importa entenderlo:
//   - Texto que escribe la persona: se redacta ANTES de mandarlo. Efectivo.
//   - Salida del modelo (lo que se guarda en `raw`): se redacta antes de
//     persistirla. Efectivo.
//   - PDFs e imagenes: NO se puede. El modelo necesita leer el documento para
//     extraer algo; taparle el CUIL primero exigiria OCR, que es el mismo
//     modelo. La boleta viaja intacta al proveedor. No pretendemos lo contrario.
//
// El riesgo grande aca es la SOBRE-redaccion: un DNI son 7-8 digitos y un monto
// en pesos tambien. Censurar por patron numerico suelto destruiria los importes
// y corromperia los datos financieros en silencio. Por eso todo lo ambiguo se
// ancla a su etiqueta ("DNI 12.345.678") y solo se censura suelto lo que tiene
// forma inconfundible (CUIT con guiones, email, 16 o 22 digitos seguidos).

export type Hallazgo = 'CUIT' | 'DNI' | 'CBU' | 'TARJETA' | 'EMAIL' | 'TELEFONO' | 'LEGAJO';

type Regla = { tipo: Hallazgo; re: RegExp; reemplazo: string | ((m: string, ...g: string[]) => string) };

const REGLAS: Regla[] = [
  // CUIT/CUIL con guiones: 20-12345678-3. Inconfundible.
  { tipo: 'CUIT', re: /\b\d{2}-\d{7,8}-\d\b/g, reemplazo: '[CUIT]' },
  // Con etiqueta, aunque venga sin guiones.
  { tipo: 'CUIT', re: /\b(CUIL|CUIT|C\.U\.I\.[LT]\.?)\s*:?\s*[\d.\-]{10,14}/gi, reemplazo: '$1 [CUIT]' },

  // CBU (22 digitos) y alias bancario largo. Ningun monto tiene 22 digitos.
  { tipo: 'CBU', re: /\b\d{22}\b/g, reemplazo: '[CBU]' },
  { tipo: 'CBU', re: /\b(CBU|CVU)\s*:?\s*[\d.\-]{20,26}/gi, reemplazo: '$1 [CBU]' },

  // Tarjeta: 16 digitos, agrupados o seguidos. Se conservan los ultimos 4, que
  // es como identificas cual tarjeta es sin exponer el numero.
  {
    tipo: 'TARJETA',
    re: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    reemplazo: (m: string) => `**** **** **** ${m.replace(/\D/g, '').slice(-4)}`,
  },
  // Ya enmascarada por el banco: se deja como esta pero cuenta como hallazgo.
  { tipo: 'TARJETA', re: /\b[X*]{4,}[ -]?[X*]{0,4}[ -]?[X*]{0,4}[ -]?\d{4}\b/gi, reemplazo: (m: string) => m },

  // DNI: SOLO con etiqueta. Suelto son 7-8 digitos, igual que un monto.
  { tipo: 'DNI', re: /\b(DNI|D\.N\.I\.?|Documento)\s*:?\s*[\d.]{7,11}/gi, reemplazo: '$1 [DNI]' },

  // Legajo y numero de empleado: solo con etiqueta, por lo mismo.
  { tipo: 'LEGAJO', re: /\b(Legajo|Nro\.?\s*Empleado|Nº\s*Legajo)\s*:?\s*[\w.\-]{1,15}/gi, reemplazo: '$1 [LEGAJO]' },

  { tipo: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, reemplazo: '[EMAIL]' },

  // Telefono: se exige el prefijo internacional o una etiqueta, para no comerse
  // numeros de comprobante ni importes.
  { tipo: 'TELEFONO', re: /\+\d{1,3}[\s\-]?\d[\d\s\-]{7,14}\d/g, reemplazo: '[TELEFONO]' },
  { tipo: 'TELEFONO', re: /\b(Tel\.?|Telefono|Teléfono|Cel\.?|WhatsApp)\s*:?\s*[\d\s\-()]{7,18}/gi, reemplazo: '$1 [TELEFONO]' },
];

export type Redaccion = { texto: string; hallazgos: Hallazgo[] };

export function redactar(entrada: string): Redaccion {
  let texto = entrada;
  const hallazgos = new Set<Hallazgo>();

  for (const { tipo, re, reemplazo } of REGLAS) {
    if (!re.test(texto)) { re.lastIndex = 0; continue; }
    re.lastIndex = 0;
    hallazgos.add(tipo);
    texto = texto.replace(re, reemplazo as never);
  }
  return { texto, hallazgos: [...hallazgos] };
}

// Recorre un objeto redactando cada string. Se usa sobre lo que devuelve el
// modelo antes de guardarlo en `raw`, que si no termina archivando el CUIL y el
// legajo del recibo indefinidamente.
export function redactarProfundo<T>(valor: T): T {
  if (typeof valor === 'string') return redactar(valor).texto as T;
  if (Array.isArray(valor)) return valor.map(redactarProfundo) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, redactarProfundo(v)]),
    ) as T;
  }
  return valor;
}
