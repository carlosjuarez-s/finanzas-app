/**
 * Percepciones sobre consumo en moneda extranjera (RG 4815 / RG 5617).
 *
 * Lo importante no es cuanto te cobraron: es que hay dos salidas distintas, y
 * la mayoria de la gente solo conoce la segunda.
 *
 *   1. Evitarla. Si el consumo en dolares se paga con dolares propios, la
 *      percepcion no se aplica. Es plata que no sale nunca del bolsillo.
 *   2. Recuperarla. Lo ya percibido es pago a cuenta de Ganancias o Bienes
 *      Personales y se tramita ante ARCA. Vuelve, pero mucho despues y en
 *      pesos que para entonces valen menos.
 *
 * Lo percibido ES lo que se habria ahorrado: si el consumo en moneda extranjera
 * se cancela con dolares propios, esa percepcion no se cobra. Por eso no hay
 * ninguna funcion que lo "calcule" —seria devolver el mismo numero— y la
 * pantalla muestra el monto una sola vez, con las dos salidas al lado.
 *
 * La alicuota vive acá y no adentro de un JSX: en Argentina estas cosas cambian
 * por resolucion, y cuando cambie tiene que haber un solo lugar que tocar.
 */

/** Alicuota vigente de la percepcion RG 5617 sobre consumo en dolares. */
export const ALICUOTA_PERCEPCION = 0.30;

/**
 * Cuanto pesa la percepcion sobre el gasto del mes, en porcentaje.
 * Sirve para dimensionarla: "son 40 mil pesos" dice menos que "es el 3% de todo
 * lo que gastaste este mes".
 */
export function pesoSobreGasto(percepArs: number, gastoArs: number): number | null {
  if (!Number.isFinite(percepArs) || !Number.isFinite(gastoArs) || gastoArs <= 0) return null;
  if (percepArs <= 0) return 0;
  return (percepArs / gastoArs) * 100;
}
