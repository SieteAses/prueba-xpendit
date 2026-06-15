/**
 * Lee el flag `USE_STUB_DATA` del entorno.
 *
 * Cuando es `true`, el módulo de reglas se cablea con las implementaciones stub
 * definidas en la Fase 1 (políticas en memoria, tasas de cambio fijas). Cuando
 * es `false` o no está definido, se cablean las implementaciones reales
 * —pendientes para fases siguientes—, de modo que la Fase 1 queda desacoplada
 * de la persistencia e integraciones definitivas: cambiar de stubs a real es
 * solo cambiar esta variable, sin tocar la capa de aplicación ni el dominio.
 */
export function useStubData(): boolean {
  return process.env.USE_STUB_DATA === 'true';
}
