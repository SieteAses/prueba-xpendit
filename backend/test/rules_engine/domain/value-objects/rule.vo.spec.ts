import { Category } from '@/rules_engine/domain/enums/category.enum';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';
import { Rule } from '@/rules_engine/domain/value-objects/rule.vo';

describe('Rule', () => {
  describe('create', () => {
    it('throws when code is empty', () => {
      expect(() =>
        Rule.create('  ', ['amount'], {
          approve: () => null,
          pending: () => null,
          rejected: () => null,
        }),
      ).toThrow('A rule must have a code');
    });

    it('throws when no field is targeted', () => {
      expect(() =>
        Rule.create('empty', [], {
          approve: () => null,
          pending: () => null,
          rejected: () => null,
        }),
      ).toThrow('A rule must target at least one field');
    });

    it('exposes code and targeted fields', () => {
      const rule = Rule.create('AMOUNT_RULE', ['amount', 'category'], {
        approve: () => null,
        pending: () => null,
        rejected: () => null,
      });

      expect(rule.getCode()).toBe('AMOUNT_RULE');
      expect(rule.getFields()).toEqual(['amount', 'category']);
    });
  });

  describe('evaluate', () => {
    const approved = { status: RuleStatus.APPROVED, message: 'Aprobado' };
    const pending = {
      status: RuleStatus.PENDING,
      message: 'Requiere revisión',
    };
    const rejected = { status: RuleStatus.REJECTED, message: 'Monto excedido' };

    // El input está tipado a { amount: Money } (value object) a partir de los fields declarados.
    const buildRule = () =>
      Rule.create('LIMITE_MONTO', ['amount'], {
        approve: (input) => (input.amount.getAmount() <= 100 ? approved : null),
        pending: (input) =>
          input.amount.getAmount() > 100 && input.amount.getAmount() <= 1000
            ? pending
            : null,
        rejected: (input) =>
          input.amount.getAmount() > 1000 ? rejected : null,
      });

    const money = (amount: number) => Money.create(amount, Currency.USD);

    it('respects precedence rejected > pending > approve', () => {
      expect(buildRule().evaluate({ amount: money(5000) })?.status).toBe(
        RuleStatus.REJECTED,
      );
      expect(buildRule().evaluate({ amount: money(500) })?.status).toBe(
        RuleStatus.PENDING,
      );
      expect(buildRule().evaluate({ amount: money(50) })?.status).toBe(
        RuleStatus.APPROVED,
      );
    });

    it('builds the alert with the rule code and the criterion message', () => {
      const result = buildRule().evaluate({ amount: money(5000) });

      expect(result?.alert?.getCode()).toBe('LIMITE_MONTO');
      expect(result?.alert?.getMessage()).toBe('Monto excedido');
    });

    it('emits no alert when the criterion has no message', () => {
      const rule = Rule.create('SILENT', ['amount'], {
        approve: () => ({ status: RuleStatus.APPROVED }),
        pending: () => null,
        rejected: () => null,
      });

      const result = rule.evaluate({ amount: money(50) });

      expect(result?.status).toBe(RuleStatus.APPROVED);
      expect(result?.alert).toBeNull();
    });

    it('returns null when no criterion matches', () => {
      const rule = Rule.create('NEVER', ['amount'], {
        approve: () => null,
        pending: () => null,
        rejected: () => null,
      });

      expect(rule.evaluate({ amount: money(50) })).toBeNull();
    });

    it('operates over enum and primitive fields too', () => {
      const cutoff = new Date('2026-01-01');
      const rule = Rule.create('CATEGORY_DATE', ['category', 'date'], {
        approve: (input) =>
          input.category === Category.SOFTWARE && input.date >= cutoff
            ? approved
            : null,
        pending: () => null,
        rejected: (input) =>
          input.category === Category.OTHER ? rejected : null,
      });

      expect(
        rule.evaluate({
          category: Category.SOFTWARE,
          date: new Date('2026-03-01'),
        })?.status,
      ).toBe(RuleStatus.APPROVED);
      expect(
        rule.evaluate({
          category: Category.OTHER,
          date: new Date('2026-03-01'),
        })?.status,
      ).toBe(RuleStatus.REJECTED);
    });
  });
});
