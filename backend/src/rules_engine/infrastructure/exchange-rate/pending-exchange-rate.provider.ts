import { ExchangeRatePort } from '../../application/ports/exchange-rate.port';
import { Currency } from '../../domain/enums/currency.enum';
import { Money } from '../../domain/value-objects/money.vo';

/**
 * Marcador de posición del proveedor de tasas de cambio real (API externa),
 * pendiente para fases siguientes. Sólo se cablea cuando `USE_STUB_DATA` es
 * distinto de `true`. Falla al usarse para señalar de forma explícita que la
 * integración definitiva aún no existe.
 */
export class PendingExchangeRateProvider implements ExchangeRatePort {
  async convert(_money: Money, _target: Currency): Promise<Money> {
    throw new Error(
      'Proveedor de tasas de cambio real no implementado (pendiente para fases siguientes). ' +
        'Defina USE_STUB_DATA=true para usar los stubs de la Fase 1.',
    );
  }
}
