/**
 * Extrae un mensaje legible de un error desconocido (capturado en un `catch`,
 * donde el tipo es `unknown`). Devuelve el mensaje del `Error` o un texto por
 * defecto. Compartido entre la capa de aplicación y la de infraestructura.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Solicitud inválida';
}
