/** Estado de la revisión expresado en español (valor externo). */
export type EstadoRevision = 'APROBADO' | 'PENDIENTE' | 'RECHAZADO';

/** Alerta levantada, con nombres de campo externos. */
export interface AlertaExterna {
  codigo: string;
  mensaje: string;
}

/**
 * Respuesta HTTP de la revisión de un gasto. Usa los nombres de campo externos
 * (los del CSV) y el estado en español. El mapper de la capa de I/O la produce
 * a partir del `ReviewPolicyResult` interno.
 */
export interface ReviewExpenseResponse {
  gasto_id: string;
  status: EstadoRevision;
  alertas: AlertaExterna[];
}
