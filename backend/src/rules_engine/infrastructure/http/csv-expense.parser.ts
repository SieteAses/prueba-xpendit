import { parse } from 'csv-parse/sync';
import { ReviewExpenseRequest } from './dto/review-expense.request';

/** Fila cruda del CSV: cada celda como string, indexada por el nombre de la cabecera. */
export type CsvExpenseRow = Record<string, string>;

/**
 * Parsea el contenido de un CSV de gastos a filas crudas usando la primera
 * línea como cabeceras. Soporta comillas dobles (comas dentro de campos),
 * recorta espacios, ignora líneas vacías y descarta el BOM si está presente.
 * No interpreta los valores: la conversión y validación viven en
 * {@link toReviewExpenseRequest}.
 */
export function parseExpensesCsv(content: string): CsvExpenseRow[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

/**
 * Convierte una fila cruda del CSV en una `ReviewExpenseRequest` (representación
 * externa) lista para el mapper. Sólo normaliza el `monto` a número; el resto de
 * la validación (moneda, categoría, etc.) la realiza el caso de uso. Lanza un
 * error si el monto está ausente o no es numérico.
 */
export function toReviewExpenseRequest(
  row: CsvExpenseRow,
): ReviewExpenseRequest {
  const rawMonto = row.monto;
  const monto = Number(rawMonto);
  if (rawMonto === undefined || rawMonto === '' || Number.isNaN(monto)) {
    throw new Error(`monto inválido: "${rawMonto ?? ''}"`);
  }

  return {
    gasto_id: row.gasto_id,
    empleado_id: row.empleado_id,
    empleado_nombre: row.empleado_nombre,
    empleado_apellido: row.empleado_apellido,
    empleado_cost_center: row.empleado_cost_center,
    categoria: row.categoria,
    monto,
    moneda: row.moneda,
    fecha: row.fecha,
  };
}
