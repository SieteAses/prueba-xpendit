import { ReviewExpenseResponse } from './review-expense.response';

/**
 * Error de una fila concreta del CSV. Identifica la fila (1-based, contando la
 * cabecera como fila 1) y, cuando se pudo leer, el `gasto_id` afectado.
 */
export interface ReviewFileRowError {
  fila: number;
  gasto_id: string | null;
  error: string;
}

/**
 * Uso del proveedor de tasas de cambio: distingue las llamadas reales a la API
 * externa (Open Exchange Rates) de las reutilizaciones de caché.
 */
export interface TasasApiUso {
  /** Llamadas reales a la API externa (cache miss). */
  llamadas_api: number;
  /** Reutilizaciones de la caché (cache hit). */
  cache_hits: number;
}

/**
 * Respuesta HTTP de la revisión por lote a partir de un CSV. Devuelve los
 * gastos revisados con éxito (`resultados`) y, por separado, las filas que
 * fallaron (`errores`), de modo que una fila inválida no aborta el lote.
 * `tasas_api` reporta el uso del proveedor de tasas: el delta de este lote y el
 * acumulado total desde que arrancó el servidor.
 */
export interface ReviewFileResponse {
  /** Marca temporal ISO 8601 del momento en que se ejecutó la revisión. Las
   * reglas dependientes de la fecha (p. ej. antigüedad) se evalúan respecto a
   * este instante, así que guardarla mantiene la analítica interpretable a
   * futuro (distancia entre la fecha del gasto y la de ejecución). */
  fecha_ejecucion: string;
  total: number;
  resultados: ReviewExpenseResponse[];
  errores: ReviewFileRowError[];
  tasas_api: { lote: TasasApiUso; total: TasasApiUso };
}
