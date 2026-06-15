import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';

describe('Money', () => {
  it('exposes amount and currency', () => {
    const money = Money.create(150, Currency.USD);

    expect(money.getAmount()).toBe(150);
    expect(money.getCurrency()).toBe(Currency.USD);
  });

  it('allows a zero amount', () => {
    expect(Money.create(0, Currency.EUR).getAmount()).toBe(0);
  });

  it('throws when the amount is negative', () => {
    expect(() => Money.create(-1, Currency.USD)).toThrow(
      'Amount cannot be negative',
    );
  });
});
