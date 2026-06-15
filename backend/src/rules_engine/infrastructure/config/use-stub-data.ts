/**
 * Lee el flag `USE_STUB_DATA` del entorno.
 *
 * Decide únicamente el provider de tasas de cambio: cuando es `true` se usan
 * las tasas fijas del stub (desarrollo offline, sin red ni clave); cuando es
 * `false` o no está definido, se usa la integración real con Open Exchange
 * Rates. Las políticas viven siempre en memoria (este proyecto no se conecta a
 * una BD), así que cambiar este flag no toca la capa de aplicación ni el
 * dominio: solo cambia el provider detrás del puerto de tasas.
 */
export function useStubData(): boolean {
  return process.env.USE_STUB_DATA === 'true';
}
