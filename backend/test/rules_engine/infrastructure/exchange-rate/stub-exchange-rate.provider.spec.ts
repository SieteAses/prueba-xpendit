import { StubExchangeRateProvider } from '@/rules_engine/infrastructure/exchange-rate/stub-exchange-rate.provider';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';

describe('StubExchangeRateProvider', () => {
  const provider = new StubExchangeRateProvider();

  it('devuelve el mismo monto al convertir USD a USD', async () => {
    const result = await provider.convert(
      Money.create(100, Currency.USD),
      Currency.USD,
    );

    expect(result.getAmount()).toBe(100);
    expect(result.getCurrency()).toBe(Currency.USD);
  });

  it('convierte de CLP a USD usando la tasa fija (950 CLP por USD)', async () => {
    const result = await provider.convert(
      Money.create(950, Currency.CLP),
      Currency.USD,
    );

    expect(result.getCurrency()).toBe(Currency.USD);
    expect(result.getAmount()).toBe(1);
  });

  it('redondea el resultado a dos decimales', async () => {
    const result = await provider.convert(
      Money.create(100, Currency.EUR),
      Currency.USD,
    );

    // 100 / 0.92 = 108.695... → 108.7
    expect(result.getAmount()).toBe(108.7);
  });

  it('lanza error si la moneda no está soportada', async () => {
    await expect(
      provider.convert(Money.create(100, Currency.JPY), Currency.USD),
    ).rejects.toThrow();
  });
});
