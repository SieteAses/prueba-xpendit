import {
  OpenExchangeRateProvider,
  HistoricalRatesClient,
} from '@/rules_engine/infrastructure/exchange-rate/open-exchange-rate.provider';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';

describe('OpenExchangeRateProvider', () => {
  const APP_ID = 'test-app-id';
  const BASE_URL = 'https://openexchangerates.org/api';
  const DATE = new Date('2026-06-10T08:30:00Z');

  /** Crea un cliente HTTP simulado que devuelve tasas (por 1 USD). */
  function fakeClient(
    rates: Partial<Record<Currency, number>>,
  ): jest.MockedFunction<HistoricalRatesClient> {
    return jest.fn(() => Promise.resolve({ base: 'USD', rates: rates }));
  }

  it('convierte de CLP a USD usando la tasa histórica del día', async () => {
    const client = fakeClient({ USD: 1, CLP: 950 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    const result = await provider.convert(
      Money.create(950, Currency.CLP),
      Currency.USD,
      DATE,
    );

    expect(result.getCurrency()).toBe(Currency.USD);
    expect(result.getAmount()).toBe(1);
  });

  it('pide la fecha en formato YYYY-MM-DD (UTC) con el app_id', async () => {
    const client = fakeClient({ USD: 1, EUR: 0.92 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    await provider.convert(Money.create(100, Currency.EUR), Currency.USD, DATE);

    expect(client).toHaveBeenCalledWith(
      'https://openexchangerates.org/api/historical/2026-06-10.json?app_id=test-app-id',
    );
  });

  it('redondea el resultado a dos decimales', async () => {
    const client = fakeClient({ USD: 1, EUR: 0.92 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    const result = await provider.convert(
      Money.create(100, Currency.EUR),
      Currency.USD,
      DATE,
    );

    // 100 / 0.92 = 108.695... → 108.7
    expect(result.getAmount()).toBe(108.7);
  });

  it('cachea las tasas por fecha: no repite la llamada para el mismo día', async () => {
    const client = fakeClient({ USD: 1, CLP: 950, EUR: 0.92 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    await provider.convert(Money.create(950, Currency.CLP), Currency.USD, DATE);
    await provider.convert(
      Money.create(100, Currency.EUR),
      Currency.USD,
      new Date('2026-06-10T20:00:00Z'),
    );

    expect(client).toHaveBeenCalledTimes(1);
  });

  it('vuelve a llamar para una fecha distinta', async () => {
    const client = fakeClient({ USD: 1, CLP: 950 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    await provider.convert(Money.create(950, Currency.CLP), Currency.USD, DATE);
    await provider.convert(
      Money.create(950, Currency.CLP),
      Currency.USD,
      new Date('2026-06-11T08:00:00Z'),
    );

    expect(client).toHaveBeenCalledTimes(2);
  });

  it('lanza error si la moneda no está en las tasas devueltas', async () => {
    const client = fakeClient({ USD: 1, CLP: 950 });
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    await expect(
      provider.convert(Money.create(100, Currency.JPY), Currency.USD, DATE),
    ).rejects.toThrow(/JPY/);
  });

  it('falla con un mensaje claro si no hay app_id al convertir', async () => {
    const client = fakeClient({ USD: 1, CLP: 950 });
    const provider = new OpenExchangeRateProvider(undefined, BASE_URL, client);

    await expect(
      provider.convert(Money.create(950, Currency.CLP), Currency.USD, DATE),
    ).rejects.toThrow(/OPEN_EXCHANGE_RATES_APP_ID/);
    expect(client).not.toHaveBeenCalled();
  });

  it('propaga el error si el cliente HTTP falla', async () => {
    const client: jest.MockedFunction<HistoricalRatesClient> = jest.fn(() =>
      Promise.reject(new Error('429 Too Many Requests')),
    );
    const provider = new OpenExchangeRateProvider(APP_ID, BASE_URL, client);

    await expect(
      provider.convert(Money.create(100, Currency.CLP), Currency.USD, DATE),
    ).rejects.toThrow(/429/);
  });
});
