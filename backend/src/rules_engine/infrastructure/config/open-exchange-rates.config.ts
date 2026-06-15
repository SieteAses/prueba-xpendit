/**
 * Lee la configuración de Open Exchange Rates del entorno. Sólo se usa cuando
 * `USE_STUB_DATA` es distinto de `true` (proveedor de tasas real). La clave
 * (`app_id`) puede faltar aquí: no se valida al arrancar para no impedir el
 * boot de la app (p. ej. en e2e o en flujos que sólo usan USD). El proveedor la
 * exige de forma perezosa, sólo cuando necesita pedir tasas a la API. La URL
 * base tiene un valor por defecto que apunta a la API pública.
 */
export interface OpenExchangeRatesConfig {
  appId: string | undefined;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://openexchangerates.org/api';

export function openExchangeRatesConfig(): OpenExchangeRatesConfig {
  return {
    appId: process.env.OPEN_EXCHANGE_RATES_APP_ID,
    baseUrl: process.env.OPEN_EXCHANGE_RATES_BASE_URL ?? DEFAULT_BASE_URL,
  };
}
