import { RuleStatus } from '../../domain/enums/rule-status.enum';

/** Alerta levantada por una regla: su código y mensaje. */
export interface ReviewAlert {
  code: string;
  message: string;
}

/**
 * Resultado del caso de uso `ReviewPolicy`: el id del gasto evaluado, el estado
 * agregado de la política y las alertas levantadas (sólo las reglas que
 * dispararon una alerta).
 */
export interface ReviewPolicyResult {
  expenseId: string;
  status: RuleStatus;
  alerts: ReviewAlert[];
}
