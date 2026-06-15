import { Currency } from '../../domain/enums/currency.enum';
import { Money } from '../../domain/value-objects/money.vo';

/**
 * Puerto de tasas de cambio. Convierte un monto de su moneda de origen a la
 * moneda destino usando la tasa vigente en una fecha dada. La implementación
 * vive en infraestructura (un stub con tasas fijas para desarrollo; en
 * producción, la API externa de tasas históricas de Open Exchange Rates).
 */
export interface ExchangeRatePort {
  /**
   * Convierte `money` a `target` usando la tasa del día `date`, devolviendo un
   * nuevo `Money` en esa moneda. La fecha es relevante porque cada gasto debe
   * valorarse con la tasa de cambio de su propio día.
   */
  convert(money: Money, target: Currency, date: Date): Promise<Money>;
}

/** Token de inyección de dependencias para el puerto `ExchangeRatePort`. */
export const EXCHANGE_RATE_PORT = Symbol('ExchangeRatePort');
