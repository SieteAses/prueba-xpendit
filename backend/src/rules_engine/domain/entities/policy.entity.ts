import { RuleStatus } from '../enums/rule-status.enum';
import { Alert } from '../value-objects/alert.vo';
import { Id } from '../value-objects/id.vo';
import { RuleField, RuleFields } from '../value-objects/rule-fields';
import { Rule } from '../value-objects/rule.vo';

export interface PolicyResult {
  status: RuleStatus;
  alerts: Alert[];
}

export class Policy {
  private constructor(
    private readonly id: Id,
    private readonly rules: readonly Rule<RuleField>[],
  ) {}

  static create(rules: Rule<RuleField>[], id?: Id): Policy {
    return new Policy(id ?? Id.create(), rules);
  }

  /**
   * Evaluates every rule against the already-assembled `RuleFields` and
   * aggregates the result. Policy is agnostic to how each field is derived
   * (see `EvaluationContext`). Status:
   *  a) any rule rejected                       → REJECTED
   *  b) none rejected, at least one pending      → PENDING
   *  c) none rejected/pending, at least approved → APPROVED
   *  d) no rule applies                          → PENDING
   */
  evaluate(fields: RuleFields): PolicyResult {
    const results = this.rules
      .map((rule) => rule.evaluate(fields))
      .filter(
        (result): result is NonNullable<typeof result> => result !== null,
      );

    const statuses = new Set(results.map((result) => result.status));

    let status: RuleStatus;
    if (statuses.has(RuleStatus.REJECTED)) {
      status = RuleStatus.REJECTED;
    } else if (statuses.has(RuleStatus.PENDING)) {
      status = RuleStatus.PENDING;
    } else if (statuses.has(RuleStatus.APPROVED)) {
      status = RuleStatus.APPROVED;
    } else {
      status = RuleStatus.PENDING;
    }

    const alerts = results
      .map((result) => result.alert)
      .filter((alert): alert is Alert => alert !== null);

    return { status, alerts };
  }

  getId(): Id {
    return this.id;
  }

  getRules(): readonly Rule<RuleField>[] {
    return this.rules;
  }
}
