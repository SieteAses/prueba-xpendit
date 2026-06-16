import { detectDuplicateCopies } from '../../domain/services/exact-duplicate-detector';
import { RuleStatus } from '../../domain/enums/rule-status.enum';
import { ReviewPolicyCommand } from '../dto/review-policy.command';
import { ReviewPolicyResult } from '../dto/review-policy.result';
import { errorMessage } from '../errors/error-message';
import { NoActivePolicyError } from '../errors/no-active-policy.error';
import { ReviewPolicyUseCase } from './review-policy.use-case';

/**
 * Código de la alerta de anomalía por gasto duplicado exacto. Vive en la capa de
 * aplicación (no en la política) a propósito: el duplicado es una anomalía *del
 * lote* (cross-gasto), no una regla sobre un gasto aislado como las de `Policy`.
 */
export const DUPLICATE_ALERT_CODE = 'GASTO_DUPLICADO';

/**
 * Resultado de una fila del lote, alineado por índice con los comandos de
 * entrada. `ok` cuando la revisión tuvo éxito; `error` con el motivo cuando la
 * fila falló (validación de campos, monto negativo, etc.), sin abortar el lote.
 */
export type BatchItemOutcome =
  | { kind: 'ok'; result: ReviewPolicyResult }
  | { kind: 'error'; message: string };

/**
 * Caso de uso de revisión por lote. Orquesta la revisión gasto a gasto
 * reutilizando {@link ReviewPolicyUseCase} y añade la detección de anomalías de
 * lote: los **duplicados exactos** (mismo monto, moneda y fecha). La primera
 * ocurrencia de cada grupo pasa sin marca; las copias 2.ª+ reciben la alerta
 * `GASTO_DUPLICADO` (citando el `expenseId` del original) y se elevan a
 * `PENDING`, salvo que la política ya las haya rechazado.
 *
 * Aísla los errores por fila para no abortar el lote; la única excepción es
 * `NoActivePolicyError`, que afecta a todas las filas y se re-lanza.
 */
export class ReviewExpenseBatchUseCase {
  constructor(private readonly reviewPolicy: ReviewPolicyUseCase) {}

  async execute(commands: ReviewPolicyCommand[]): Promise<BatchItemOutcome[]> {
    const duplicateOf = detectDuplicateCopies(
      commands.map((command) => ({
        id: command.expenseId,
        amount: command.amount,
        currency: command.currency,
        date: command.date,
      })),
    );

    const outcomes: BatchItemOutcome[] = [];
    for (let i = 0; i < commands.length; i++) {
      try {
        const result = await this.reviewPolicy.execute(commands[i]);
        const originalId = duplicateOf[i];
        outcomes.push({
          kind: 'ok',
          result:
            originalId !== null
              ? withDuplicateAlert(result, originalId)
              : result,
        });
      } catch (error) {
        if (error instanceof NoActivePolicyError) {
          throw error;
        }
        outcomes.push({ kind: 'error', message: errorMessage(error) });
      }
    }
    return outcomes;
  }
}

/** Anexa la alerta de duplicado y eleva el estado (sin degradar un RECHAZADO). */
function withDuplicateAlert(
  result: ReviewPolicyResult,
  originalId: string,
): ReviewPolicyResult {
  return {
    ...result,
    status:
      result.status === RuleStatus.REJECTED
        ? RuleStatus.REJECTED
        : RuleStatus.PENDING,
    alerts: [
      ...result.alerts,
      {
        code: DUPLICATE_ALERT_CODE,
        message: `Posible gasto duplicado de ${originalId}: monto, moneda y fecha idénticos a un gasto anterior.`,
      },
    ],
  };
}
