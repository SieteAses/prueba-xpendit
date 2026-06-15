import { Policy } from '@/rules_engine/domain/entities/policy.entity';
import { Category } from '@/rules_engine/domain/enums/category.enum';
import { CostCenter } from '@/rules_engine/domain/enums/cost-center.enum';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';
import {
  RuleField,
  RuleFields,
} from '@/rules_engine/domain/value-objects/rule-fields';
import { Rule } from '@/rules_engine/domain/value-objects/rule.vo';

// Rule (con su código) que siempre arroja `status` con `message`, sin importar el input.
const ruleWith = (
  code: string,
  status: RuleStatus,
  message: string,
): Rule<RuleField> =>
  Rule.create(code, ['amount'], {
    approve: () =>
      status === RuleStatus.APPROVED ? { status, message } : null,
    pending: () => (status === RuleStatus.PENDING ? { status, message } : null),
    rejected: () =>
      status === RuleStatus.REJECTED ? { status, message } : null,
  });

// Rule that never applies.
const inertRule = (code: string): Rule<RuleField> =>
  Rule.create(code, ['amount'], {
    approve: () => null,
    pending: () => null,
    rejected: () => null,
  });

describe('Policy', () => {
  // Policy evalúa sobre un RuleFields ya armado; no depende de entidades.
  const fields: RuleFields = {
    amount: Money.create(500, Currency.USD),
    category: Category.SOFTWARE,
    costCenter: CostCenter.CORE_ENGINEERING,
    date: new Date('2026-06-14'),
    ageInDays: 0,
  };

  it('is REJECTED when any rule triggers rejected', () => {
    const policy = Policy.create([
      ruleWith('OK', RuleStatus.APPROVED, 'Aprobado'),
      ruleWith('REVIEW', RuleStatus.PENDING, 'Pendiente de revisión'),
      ruleWith('OVER', RuleStatus.REJECTED, 'Rechazado'),
    ]);

    expect(policy.evaluate(fields).status).toBe(RuleStatus.REJECTED);
  });

  it('is PENDING when no rejected but at least one pending', () => {
    const policy = Policy.create([
      ruleWith('OK', RuleStatus.APPROVED, 'Aprobado'),
      ruleWith('REVIEW', RuleStatus.PENDING, 'Pendiente de revisión'),
    ]);

    expect(policy.evaluate(fields).status).toBe(RuleStatus.PENDING);
  });

  it('is APPROVED when only approved rules trigger', () => {
    const policy = Policy.create([
      ruleWith('OK_1', RuleStatus.APPROVED, 'Aprobado'),
      ruleWith('OK_2', RuleStatus.APPROVED, 'Aprobado'),
    ]);

    expect(policy.evaluate(fields).status).toBe(RuleStatus.APPROVED);
  });

  it('is PENDING when no rule applies', () => {
    const policy = Policy.create([inertRule('X'), inertRule('Y')]);

    const result = policy.evaluate(fields);
    expect(result.status).toBe(RuleStatus.PENDING);
    expect(result.alerts).toEqual([]);
  });

  it('collects the alert of every rule that triggered, each carrying its rule code', () => {
    const policy = Policy.create([
      ruleWith('OK', RuleStatus.APPROVED, 'Aprobado'),
      inertRule('X'),
      ruleWith('OVER', RuleStatus.REJECTED, 'Rechazado'),
    ]);

    const result = policy.evaluate(fields);

    expect(result.alerts.map((a) => a.getCode())).toEqual(['OK', 'OVER']);
    expect(result.alerts.map((a) => a.getMessage())).toEqual([
      'Aprobado',
      'Rechazado',
    ]);
  });
});
