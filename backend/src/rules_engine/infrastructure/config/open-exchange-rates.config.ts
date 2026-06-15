/**
 * Lee la configuración de Open Exchange Rates del entorno. Sólo se invoca cuando
 * `USE_STUB_DATA` es distinto de `true`, es decir, cuando se usa el proveedor de
 * tasas real. La clave (`app_id`) es obligatoria; la URL base tiene un valor por
 * defecto que apunta a la API pública.
 */
export interface OpenExchangeRatesConfig {
  appId: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://openexchangerates.org/api';

export function openExchangeRatesConfig(): OpenExchangeRatesConfig {
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
  if (!appId) {
    throw new Error(
      'Falta la variable de entorno OPEN_EXCHANGE_RATES_APP_ID. ' +
        'Defínala para usar el proveedor de tasas real, o use USE_STUB_DATA=true.',
    );
  }
  return {
    appId,
    baseUrl: process.env.OPEN_EXCHANGE_RATES_BASE_URL ?? DEFAULT_BASE_URL,
  };
}
