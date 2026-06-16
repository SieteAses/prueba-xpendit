/**
 * Ítem mínimo para la detección de duplicados exactos. Usa los valores crudos
 * del gasto (pre-conversión de moneda): un duplicado exacto es aquel con el
 * mismo `amount`, `currency` y `date`.
 */
export interface DuplicateItem {
  id: string;
  amount: number;
  currency: string;
  date: string;
}

/**
 * Detecta duplicados exactos (mismo monto, moneda y fecha) en una lista
 * ordenada de gastos. Devuelve un arreglo alineado por índice: para cada gasto
 * que sea una copia (2.ª ocurrencia en adelante de su grupo) devuelve el `id`
 * de la **primera** ocurrencia del grupo (el original que "sí pasó"); para la
 * primera ocurrencia y los gastos no duplicados devuelve `null`.
 *
 * Servicio puro de dominio: sin dependencias de framework, sin efectos.
 */
export function detectDuplicateCopies(
  items: DuplicateItem[],
): (string | null)[] {
  const firstIdByKey = new Map<string, string>();

  return items.map((item) => {
    const key = `${item.amount}|${item.currency}|${item.date}`;
    const original = firstIdByKey.get(key);
    if (original !== undefined) {
      return original;
    }
    firstIdByKey.set(key, item.id);
    return null;
  });
}
