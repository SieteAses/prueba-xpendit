import { PolicyRepository } from '../../application/ports/policy-repository.port';
import { Policy } from '../../domain/entities/policy.entity';
import { Category } from '../../domain/enums/category.enum';
import { CostCenter } from '../../domain/enums/cost-center.enum';
import { RuleStatus } from '../../domain/enums/rule-status.enum';
import { Id } from '../../domain/value-objects/id.vo';
import { RuleField } from '../../domain/value-objects/rule-fields';
import { Rule } from '../../domain/value-objects/rule.vo';

/** Id de la política activa sembrada por defecto en el stub. */
export const CURRENT_POLICY_ID = 'current-policy';

/**
 * Stub del repositorio de políticas: datos en memoria. Mantiene una única
 * política activa (`current_policy`) con tres reglas. Las reglas de monto se
 * expresan en la moneda base (USD), por lo que el caso de uso debe normalizar
 * el monto antes de evaluar. En fases siguientes se reemplaza por una BD real.
 */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly currentPolicy: Policy =
    InMemoryPolicyRepository.buildCurrentPolicy();

  findCurrent(): Promise<Policy | null> {
    return Promise.resolve(this.currentPolicy);
  }

  private static buildCurrentPolicy(): Policy {
    return Policy.create(
      [
        InMemoryPolicyRepository.antiquityRule(),
        InMemoryPolicyRepository.foodLimitRule(),
        InMemoryPolicyRepository.costCenterRule(),
      ],
      Id.create(CURRENT_POLICY_ID),
    );
  }

  /**
   * Regla 1 — Antigüedad del gasto (en días):
   *   0 ≤ días ≤ 30  → APROBADO
   *   31 ≤ días ≤ 60 → PENDIENTE
   *   días > 60      → RECHAZADO
   */
  private static antiquityRule(): Rule<RuleField> {
    return Rule.create('LIMITE_ANTIGUEDAD', ['ageInDays'], {
      rejected: ({ ageInDays }) =>
        ageInDays > 60
          ? {
              status: RuleStatus.REJECTED,
              message: 'Gasto excede los 60 días de antigüedad.',
            }
          : null,
      pending: ({ ageInDays }) =>
        ageInDays >= 31 && ageInDays <= 60
          ? {
              status: RuleStatus.PENDING,
              message: 'Gasto excede los 30 días. Requiere revisión.',
            }
          : null,
      approve: ({ ageInDays }) =>
        ageInDays >= 0 && ageInDays <= 30
          ? { status: RuleStatus.APPROVED }
          : null,
    });
  }

  /**
   * Regla 2 — Límite de monto para 'food' (en USD):
   *   monto ≤ 100         → APROBADO
   *   100 < monto ≤ 150   → PENDIENTE (Requiere revisión)
   *   monto > 150         → RECHAZADO (Excede límite aprobado)
   * Sólo aplica a la categoría 'food'.
   */
  private static foodLimitRule(): Rule<RuleField> {
    const APPROVED_LIMIT = 100;
    const PENDING_LIMIT = 150;

    return Rule.create('LIMITE_FOOD', ['amount', 'category'], {
      rejected: ({ amount, category }) =>
        category === Category.FOOD && amount.getAmount() > PENDING_LIMIT
          ? { status: RuleStatus.REJECTED, message: 'Excede límite aprobado' }
          : null,
      pending: ({ amount, category }) =>
        category === Category.FOOD &&
        amount.getAmount() > APPROVED_LIMIT &&
        amount.getAmount() <= PENDING_LIMIT
          ? { status: RuleStatus.PENDING, message: 'Requiere revisión' }
          : null,
      approve: ({ amount, category }) =>
        category === Category.FOOD && amount.getAmount() <= APPROVED_LIMIT
          ? { status: RuleStatus.APPROVED }
          : null,
    });
  }

  /**
   * Regla 3 — Regla cruzada centro de costo / categoría:
   *   cost_center = 'core_engineering' AND category = 'food' → RECHAZADO
   */
  private static costCenterRule(): Rule<RuleField> {
    return Rule.create('POLITICA_CENTRO_COSTO', ['costCenter', 'category'], {
      rejected: ({ costCenter, category }) =>
        costCenter === CostCenter.CORE_ENGINEERING && category === Category.FOOD
          ? {
              status: RuleStatus.REJECTED,
              message:
                "El centro de costo 'core_engineering' no puede reportar gastos de 'food'.",
            }
          : null,
      pending: () => null,
      approve: () => null,
    });
  }
}
