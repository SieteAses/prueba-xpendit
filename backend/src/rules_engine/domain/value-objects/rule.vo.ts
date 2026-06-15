import { RuleStatus } from '../enums/rule-status.enum';
import { Alert } from './alert.vo';
import { Id } from './id.vo';
import { RuleField, RuleInput } from './rule-fields';

/**
 * Lo que produce un criterio cuando aplica: un veredicto (`status`) y,
 * opcionalmente, un mensaje de alerta. El código de la alerta NO lo decide el
 * criterio: lo aporta la regla (cada regla tiene un único `code`). Sin
 * `message` no se emite alerta (típico de los veredictos APROBADO).
 */
export interface RuleOutcome {
  status: RuleStatus;
  message?: string;
}

/**
 * Resultado de evaluar una regla: veredicto y, si corresponde, la alerta (con
 * el código de la regla). `alert` es `null` cuando el veredicto no emite alerta.
 */
export interface RuleResult {
  status: RuleStatus;
  alert: Alert | null;
}

/**
 * Criterio de una regla: recibe los campos declarados (ya tipados) y devuelve
 * un resultado si el criterio aplica, o `null` si no aplica.
 */
export type RuleCriterion<K extends RuleField> = (
  input: RuleInput<K>,
) => RuleOutcome | null;

interface RuleCriteria<K extends RuleField> {
  approve: RuleCriterion<K>;
  pending: RuleCriterion<K>;
  rejected: RuleCriterion<K>;
}

export class Rule<K extends RuleField> {
  private constructor(
    private readonly id: Id,
    private readonly code: string,
    private readonly fields: readonly K[],
    private readonly criteria: RuleCriteria<K>,
  ) {}

  static create<K extends RuleField>(
    code: string,
    fields: K[],
    criteria: RuleCriteria<K>,
    id?: Id,
  ): Rule<K> {
    if (!code.trim()) {
      throw new Error('A rule must have a code');
    }
    if (fields.length === 0) {
      throw new Error('A rule must target at least one field');
    }
    return new Rule(id ?? Id.create(), code, fields, criteria);
  }

  /**
   * Evalúa el input; precedencia: rechazo > pendiente > aprobado. Si algún
   * criterio aplica, arma la alerta con el `code` de la regla y el mensaje del
   * criterio. Devuelve `null` si ninguno aplica.
   */
  evaluate(input: RuleInput<K>): RuleResult | null {
    const outcome =
      this.criteria.rejected(input) ??
      this.criteria.pending(input) ??
      this.criteria.approve(input);

    if (!outcome) {
      return null;
    }

    const alert =
      outcome.message !== undefined
        ? Alert.create(this.code, outcome.message)
        : null;

    return { status: outcome.status, alert };
  }

  getId(): Id {
    return this.id;
  }

  getCode(): string {
    return this.code;
  }

  getFields(): readonly K[] {
    return this.fields;
  }
}
