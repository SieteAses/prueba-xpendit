import { ReviewPolicyCommand } from '../../application/dto/review-policy.command';
import { ReviewPolicyResult } from '../../application/dto/review-policy.result';
import { RuleStatus } from '../../domain/enums/rule-status.enum';
import {
  EstadoRevision,
  ReviewExpenseResponse,
} from './dto/review-expense.response';
import { ReviewExpenseRequest } from './dto/review-expense.request';

/** Traducción del estado interno (inglés) al estado externo (español). */
const ESTADO_POR_STATUS: Record<RuleStatus, EstadoRevision> = {
  [RuleStatus.APPROVED]: 'APROBADO',
  [RuleStatus.PENDING]: 'PENDIENTE',
  [RuleStatus.REJECTED]: 'RECHAZADO',
};

/**
 * Mapper de la capa de I/O: traduce entre la representación externa (nombres de
 * campo del CSV, estado en español) y los contratos internos de la aplicación
 * (camelCase, enums en inglés). Toda la conversión vive aquí; ni la aplicación
 * ni el dominio conocen los nombres externos.
 */
export const ReviewPolicyMapper = {
  toCommand(request: ReviewExpenseRequest): ReviewPolicyCommand {
    return {
      expenseId: request.gasto_id,
      employeeId: request.empleado_id,
      employeeFirstName: request.empleado_nombre,
      employeeLastName: request.empleado_apellido,
      costCenter: request.empleado_cost_center,
      category: request.categoria,
      amount: request.monto,
      currency: request.moneda,
      date: request.fecha,
    };
  },

  toResponse(result: ReviewPolicyResult): ReviewExpenseResponse {
    return {
      gasto_id: result.expenseId,
      status: ESTADO_POR_STATUS[result.status],
      alertas: result.alerts.map((alerta) => ({
        codigo: alerta.code,
        mensaje: alerta.message,
      })),
    };
  },
};
