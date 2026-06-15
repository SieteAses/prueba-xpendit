import { Currency } from '../enums/currency.enum';

/**
 * Moneda base del motor de reglas. Los montos de las reglas se expresan en
 * esta moneda, por lo que cualquier gasto en otra moneda debe convertirse a
 * ella antes de evaluar la política.
 */
export const BASE_CURRENCY: Currency = Currency.USD;
