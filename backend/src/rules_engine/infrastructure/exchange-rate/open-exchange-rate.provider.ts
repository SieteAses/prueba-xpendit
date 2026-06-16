import { ExchangeRatePort } from '../../application/ports/exchange-rate.port';
import { Currency } from '../../domain/enums/currency.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { ExchangeRateCallCounter } from './exchange-rate-call-counter';

/** Respuesta del endpoint `historical` de Open Exchange Rates. */
export interface HistoricalRatesResponse {
  /** Moneda base de las tasas; en el plan gratuito siempre `USD`. */
  base: string;
  /** Unidades de cada moneda por 1 unidad de la base. */
  rates: Record<string, number>;
}

/**
 * Cliente HTTP que obtiene las tasas históricas de una URL ya construida.
 * Se inyecta para mantener el provider desacoplado del transporte (fetch/axios)
 * y poder simularlo en pruebas. Debe rechazar la promesa ante errores HTTP.
 */
export type HistoricalRatesClient = (
  url: string,
) => Promise<HistoricalRatesResponse>;

/**
 * Cliente por defecto basado en `fetch` (Node 18+). Lanza si la respuesta no es
 * exitosa para que el error de la API (clave inválida, cuota agotada, etc.) se
 * propague como rechazo de la promesa.
 */
export const fetchHistoricalRatesClient: HistoricalRatesClient = async (
  url,
) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Open Exchange Rates respondió ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as HistoricalRatesResponse;
};

/**
 * Proveedor real de tasas de cambio sobre Open Exchange Rates. Usa el endpoint
 * `historical/{YYYY-MM-DD}.json`, que devuelve las tasas (por 1 USD) del día del
 * gasto, de modo que cada gasto se valora con la tasa de su propia fecha.
 *
 * Las tasas históricas de un día son inmutables, así que se cachean por fecha en
 * memoria para no agotar el límite mensual de peticiones de la API.
 */
export class OpenExchangeRateProvider implements ExchangeRatePort {
  private readonly cache = new Map<string, Record<string, number>>();

  constructor(
    private readonly appId: string | undefined,
    private readonly baseUrl: string,
    private readonly client: HistoricalRatesClient = fetchHistoricalRatesClient,
    private readonly counter?: ExchangeRateCallCounter,
  ) {}

  async convert(money: Money, target: Currency, date: Date): Promise<Money> {
    const rates = await this.ratesFor(date);

    const fromRate = this.rateFor(rates, money.getCurrency());
    const toRate = this.rateFor(rates, target);

    const amountInUsd = money.getAmount() / fromRate;
    const converted = amountInUsd * toRate;

    return Money.create(this.round(converted), target);
  }

  /** Devuelve las tasas del día, usando la caché o pidiéndolas a la API. */
  private async ratesFor(date: Date): Promise<Record<string, number>> {
    const dateKey = OpenExchangeRateProvider.toIsoDate(date);
    const cached = this.cache.get(dateKey);
    if (cached) {
      this.counter?.incrementCacheHit();
      return cached;
    }

    if (!this.appId) {
      throw new Error(
        'Falta la variable de entorno OPEN_EXCHANGE_RATES_APP_ID. ' +
          'Defínala para usar el proveedor de tasas real, o use USE_STUB_DATA=true.',
      );
    }

    const url = `${this.baseUrl}/historical/${dateKey}.json?app_id=${this.appId}`;
    this.counter?.incrementApiCall();
    const { rates } = await this.client(url);
    this.cache.set(dateKey, rates);
    return rates;
  }

  private rateFor(rates: Record<string, number>, currency: Currency): number {
    const rate = rates[currency];
    if (rate === undefined) {
      throw new Error(
        `No hay tasa de cambio disponible para la moneda "${currency}"`,
      );
    }
    return rate;
  }

  /** Formatea la fecha como `YYYY-MM-DD` en UTC (formato del endpoint). */
  private static toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
