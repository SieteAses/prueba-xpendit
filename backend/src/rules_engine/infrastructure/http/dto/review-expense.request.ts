/**
 * Cuerpo de la petición HTTP de revisión de un gasto. Usa los nombres de campo
 * externos (los del CSV). El mapper de la capa de I/O lo traduce al
 * `ReviewPolicyCommand` interno (camelCase).
 */
export interface ReviewExpenseRequest {
  gasto_id: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_apellido: string;
  empleado_cost_center: string;
  categoria: string;
  monto: number;
  moneda: string;
  fecha: string;
}
