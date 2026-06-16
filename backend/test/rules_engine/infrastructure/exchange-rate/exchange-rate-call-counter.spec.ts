import { ExchangeRateCallCounter } from '@/rules_engine/infrastructure/exchange-rate/exchange-rate-call-counter';

describe('ExchangeRateCallCounter', () => {
  it('acumula llamadas reales y cache hits en el total', () => {
    const counter = new ExchangeRateCallCounter();

    counter.incrementApiCall();
    counter.incrementApiCall();
    counter.incrementCacheHit();

    expect(counter.total).toEqual({ apiCalls: 2, cacheHits: 1 });
  });

  it('measure() atribuye solo el uso ocurrido dentro de su ejecución', async () => {
    const counter = new ExchangeRateCallCounter();
    counter.incrementApiCall(); // uso previo, fuera de measure

    const { result, usage } = await counter.measure(async () => {
      counter.incrementApiCall();
      counter.incrementCacheHit();
      await Promise.resolve();
      counter.incrementCacheHit();
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(usage).toEqual({ apiCalls: 1, cacheHits: 2 });
    // El total incluye también el uso previo.
    expect(counter.total).toEqual({ apiCalls: 2, cacheHits: 2 });
  });

  it('aísla mediciones concurrentes entre sí', async () => {
    const counter = new ExchangeRateCallCounter();

    const a = counter.measure(async () => {
      counter.incrementApiCall();
      await Promise.resolve();
      counter.incrementApiCall();
    });
    const b = counter.measure(async () => {
      await Promise.resolve();
      counter.incrementCacheHit();
    });

    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.usage).toEqual({ apiCalls: 2, cacheHits: 0 });
    expect(rb.usage).toEqual({ apiCalls: 0, cacheHits: 1 });
    expect(counter.total).toEqual({ apiCalls: 2, cacheHits: 1 });
  });
});
