import { ReviewPolicyCommand } from '@/rules_engine/application/dto/review-policy.command';
import { NoActivePolicyError } from '@/rules_engine/application/errors/no-active-policy.error';
import { ExchangeRatePort } from '@/rules_engine/application/ports/exchange-rate.port';
import { PolicyRepository } from '@/rules_engine/application/ports/policy-repository.port';
import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
import { Policy } from '@/rules_engine/domain/entities/policy.entity';
import { Category } from '@/rules_engine/domain/enums/category.enum';
import { CostCenter } from '@/rules_engine/domain/enums/cost-center.enum';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';
import { RuleField } from '@/rules_engine/domain/value-objects/rule-fields';
import { Rule } from '@/rules_engine/domain/value-objects/rule.vo';

// Regla (un único código) que rechaza cuando el monto (ya en USD) supera el umbral.
const overThreshold = (threshold: number): Rule<RuleField> =>
  Rule.create('LIMITE_MONTO', ['amount'], {
    approve: ({ amount }) =>
      amount.getAmount() <= threshold
        ? { status: RuleStatus.APPROVED, message: 'Dentro del límite' }
        : null,
    pending: () => null,
    rejected: ({ amount }) =>
      amount.getAmount() > threshold
        ? { status: RuleStatus.REJECTED, message: 'Supera el límite' }
        : null,
  });

describe('ReviewPolicyUseCase', () => {
  let policy: Policy;
  let policies: jest.Mocked<PolicyRepository>;
  let exchangeRate: jest.Mocked<ExchangeRatePort>;
  let useCase: ReviewPolicyUseCase;

  const baseCommand: ReviewPolicyCommand = {
    expenseId: 'g_001',
    employeeId: 'e_002',
    employeeFirstName: 'Bruno',
    employeeLastName: 'Soto',
    costCenter: CostCenter.SALES_TEAM,
    category: Category.FOOD,
    amount: 100,
    currency: Currency.USD,
    date: '2026-05-28',
  };

  beforeEach(() => {
    policy = Policy.create([overThreshold(1000)]);
    policies = { findCurrent: jest.fn().mockResolvedValue(policy) };
    exchangeRate = { convert: jest.fn() };
    const clock = { now: () => new Date('2026-06-01T00:00:00Z') };
    useCase = new ReviewPolicyUseCase(policies, exchangeRate, clock);
  });

  it('evalúa contra la política activa (current_policy)', async () => {
    await useCase.execute(baseCommand);

    expect(policies.findCurrent).toHaveBeenCalledTimes(1);
  });

  it('devuelve el id del gasto evaluado', async () => {
    const result = await useCase.execute({
      ...baseCommand,
      expenseId: 'g_042',
    });

    expect(result.expenseId).toBe('g_042');
  });

  it('lanza NoActivePolicyError cuando no hay política activa', async () => {
    policies.findCurrent.mockResolvedValue(null);

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(
      NoActivePolicyError,
    );
  });

  it('no convierte cuando el gasto ya viene en la moneda base (USD)', async () => {
    const result = await useCase.execute({
      ...baseCommand,
      amount: 100,
      currency: Currency.USD,
    });

    expect(exchangeRate.convert).not.toHaveBeenCalled();
    expect(result.status).toBe(RuleStatus.APPROVED);
    expect(result.alerts).toEqual([
      { code: 'LIMITE_MONTO', message: 'Dentro del límite' },
    ]);
  });

  it('convierte a USD cuando el gasto viene en otra moneda y evalúa con el monto convertido', async () => {
    // 1.200.000 CLP → 1500 USD: supera el umbral de 1000 USD.
    exchangeRate.convert.mockResolvedValue(Money.create(1500, Currency.USD));

    const result = await useCase.execute({
      ...baseCommand,
      amount: 1_200_000,
      currency: Currency.CLP,
    });

    expect(exchangeRate.convert).toHaveBeenCalledTimes(1);
    const [money, target] = exchangeRate.convert.mock.calls[0];
    expect(money.getAmount()).toBe(1_200_000);
    expect(money.getCurrency()).toBe(Currency.CLP);
    expect(target).toBe(Currency.USD);

    expect(result.status).toBe(RuleStatus.REJECTED);
    expect(result.alerts).toEqual([
      { code: 'LIMITE_MONTO', message: 'Supera el límite' },
    ]);
  });

  it('devuelve alertas vacías cuando ninguna regla dispara', async () => {
    const inertRule = Rule.create('INERT', ['amount'], {
      approve: () => null,
      pending: () => null,
      rejected: () => null,
    });
    policies.findCurrent.mockResolvedValue(Policy.create([inertRule]));

    const result = await useCase.execute(baseCommand);

    expect(result.alerts).toEqual([]);
  });

  it('rechaza una moneda inválida', async () => {
    await expect(
      useCase.execute({ ...baseCommand, currency: 'XXX' }),
    ).rejects.toThrow();
  });

  it('rechaza una categoría inválida', async () => {
    await expect(
      useCase.execute({ ...baseCommand, category: 'nope' }),
    ).rejects.toThrow();
  });

  it('rechaza un centro de costo inválido', async () => {
    await expect(
      useCase.execute({ ...baseCommand, costCenter: 'nope' }),
    ).rejects.toThrow();
  });
});
