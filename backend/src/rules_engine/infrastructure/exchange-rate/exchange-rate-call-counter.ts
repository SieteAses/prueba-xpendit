import { AsyncLocalStorage } from 'node:async_hooks';

/** Uso del proveedor de tasas: llamadas reales a la API y reutilizaciones de caché. */
export interface ExchangeRateUsage {
  /** Llamadas reales a la API externa (cache miss). */
  apiCalls: number;
  /** Reutilizaciones de la caché (cache hit). */
  cacheHits: number;
}

/**
 * Contador de uso del proveedor de tasas de cambio. Distingue las llamadas
 * **reales** a la API externa (cache miss) de las reutilizaciones de **caché**
 * (cache hit). Acumula totales desde el arranque y, mediante {@link measure},
 * permite atribuir el uso de una ejecución concreta (p. ej. un lote) de forma
 * aislada por petición —incluso bajo concurrencia— usando `AsyncLocalStorage`.
 */
export class ExchangeRateCallCounter {
  private _apiCalls = 0;
  private _cacheHits = 0;
  private readonly scope = new AsyncLocalStorage<ExchangeRateUsage>();

  /** Registra una llamada real a la API externa (cache miss). */
  incrementApiCall(): void {
    this._apiCalls += 1;
    const store = this.scope.getStore();
    if (store) {
      store.apiCalls += 1;
    }
  }

  /** Registra una reutilización de la caché (cache hit). */
  incrementCacheHit(): void {
    this._cacheHits += 1;
    const store = this.scope.getStore();
    if (store) {
      store.cacheHits += 1;
    }
  }

  /** Total acumulado desde el arranque del servidor. */
  get total(): ExchangeRateUsage {
    return { apiCalls: this._apiCalls, cacheHits: this._cacheHits };
  }

  /**
   * Ejecuta `fn` midiendo el uso atribuible a esa ejecución. Devuelve el
   * resultado junto con el uso medido. Aislado por petición: dos `measure`
   * concurrentes no se contaminan entre sí.
   */
  async measure<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; usage: ExchangeRateUsage }> {
    const store: ExchangeRateUsage = { apiCalls: 0, cacheHits: 0 };
    const result = await this.scope.run(store, fn);
    return { result, usage: { ...store } };
  }
}
