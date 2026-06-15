import { Currency } from '../../domain/enums/currency.enum';
import { Money } from '../../domain/value-objects/money.vo';

/**
 * Puerto de tasas de cambio. Convierte un monto de su moneda de origen a la
 * moneda destino. La implementación vive en infraestructura (por ahora un stub
 * con tasas fijas; en fases siguientes, una API externa de tasas).
 */
export interface ExchangeRatePort {
  /** Convierte `money` a `target`, devolviendo un nuevo `Money` en esa moneda. */
  convert(money: Money, target: Currency): Promise<Money>;
}

/** Token de inyección de dependencias para el puerto `ExchangeRatePort`. */
export const EXCHANGE_RATE_PORT = Symbol('ExchangeRatePort');
