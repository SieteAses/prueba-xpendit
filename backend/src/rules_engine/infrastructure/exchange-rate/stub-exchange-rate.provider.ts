import { ExchangeRatePort } from '../../application/ports/exchange-rate.port';
import { Currency } from '../../domain/enums/currency.enum';
import { Money } from '../../domain/value-objects/money.vo';

/**
 * Stub del puerto de tasas de cambio: tasas fijas en memoria, expresadas como
 * unidades de cada moneda por 1 USD. En fases siguientes se reemplaza por una
 * API externa de tasas. Sólo incluye un subconjunto de monedas; convertir
 * desde/hacia una no soportada lanza un error.
 */
export class StubExchangeRateProvider implements ExchangeRatePort {
  /** Unidades de la moneda por 1 USD. */
  private static readonly RATES_PER_USD: Partial<Record<Currency, number>> = {
    [Currency.USD]: 1,
    [Currency.EUR]: 0.92,
    [Currency.GBP]: 0.79,
    [Currency.CLP]: 950,
    [Currency.MXN]: 17.1,
    [Currency.BRL]: 5.0,
    [Currency.COP]: 4000,
    [Currency.PEN]: 3.75,
    [Currency.ARS]: 900,
  };

  async convert(money: Money, target: Currency): Promise<Money> {
    const fromRate = this.rateFor(money.getCurrency());
    const toRate = this.rateFor(target);

    const amountInUsd = money.getAmount() / fromRate;
    const converted = amountInUsd * toRate;

    return Money.create(this.round(converted), target);
  }

  private rateFor(currency: Currency): number {
    const rate = StubExchangeRateProvider.RATES_PER_USD[currency];
    if (rate === undefined) {
      throw new Error(
        `No hay tasa de cambio disponible para la moneda "${currency}"`,
      );
    }
    return rate;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
