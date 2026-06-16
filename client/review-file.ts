/**
 * Cliente de consola para la revisión de gastos por lote.
 *
 * Sube un archivo CSV al backend (`POST /expenses/review-file`) e imprime el
 * resultado en consola:
 *   (a) un gráfico de estados (grilla coloreada: una celda por gasto),
 *   (b) una tabla con las filas que fallaron y el porqué,
 *   (c) una tabla con el resultado de cada gasto.
 *
 * Uso:
 *   node review-file.ts <ruta-al-csv> [baseUrl]
 *
 * Ejemplos:
 *   node review-file.ts ./expenses.sample.csv
 *   node review-file.ts ./expenses.sample.csv http://localhost:3030
 *   API_URL=http://localhost:3030 node review-file.ts ./expenses.sample.csv
 *
 * Requiere Node 24+ (ejecuta TypeScript de forma nativa y trae fetch/FormData/Blob
 * globales).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import Chartscii from 'chartscii';
import Table from 'cli-table3';

interface AlertaExterna {
  codigo: string;
  mensaje: string;
}

type Estado = 'APROBADO' | 'PENDIENTE' | 'RECHAZADO';

interface ResultadoGasto {
  gasto_id: string;
  status: Estado;
  alertas: AlertaExterna[];
}

interface ErrorFila {
  fila: number;
  gasto_id: string | null;
  error: string;
}

interface TasasApiUso {
  llamadas_api: number;
  cache_hits: number;
}

interface RespuestaLote {
  fecha_ejecucion: string;
  total: number;
  resultados: ResultadoGasto[];
  errores: ErrorFila[];
  tasas_api: { lote: TasasApiUso; total: TasasApiUso };
}

// Colores ANSI para texto.
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/** Color de primer plano ANSI truecolor a partir de un hex (#rrggbb). */
function fgHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

// Orden, clave numérica (para el gráfico `status`) y color de cada estado.
// Verde esmeralda vs ámbar para que se diferencien bien del amarillo/verde básicos.
const ESTADOS: { status: Estado; key: number; color: string; fg: string }[] = [
  { status: 'APROBADO', key: 0, color: '#00b894', fg: fgHex('#00b894') },
  { status: 'PENDIENTE', key: 1, color: '#ffb300', fg: fgHex('#ffb300') },
  { status: 'RECHAZADO', key: 2, color: '#e63946', fg: fgHex('#e63946') },
];

function uso(): never {
  console.error('Uso: node review-file.ts <ruta-al-csv> [baseUrl]');
  process.exit(1);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    uso();
  }
  const baseUrl = (
    process.argv[3] ??
    process.env.API_URL ??
    'http://localhost:3030'
  ).replace(/\/$/, '');

  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: 'text/csv' }),
    basename(filePath),
  );

  const url = `${baseUrl}/expenses/review-file`;
  console.log(`${c.dim}→ POST ${url}  (${basename(filePath)})${c.reset}\n`);

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (error) {
    console.error(
      `${c.red}No se pudo conectar con ${baseUrl}.${c.reset} ¿Está el backend corriendo? (cd backend && pnpm start)`,
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const mensaje =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : JSON.stringify(body);
    console.error(`${c.red}Error ${res.status}:${c.reset} ${mensaje}`);
    process.exit(1);
  }

  imprimirLote(body as RespuestaLote);
}

function imprimirLote(lote: RespuestaLote): void {
  console.log(
    `${c.dim}Ejecutado: ${lote.fecha_ejecucion}${c.reset}\n`,
  );
  imprimirGraficoEstados(lote.resultados);
  imprimirTablaErrores(lote.errores);
  imprimirTablaResultados(lote.resultados);
  imprimirTasasApi(lote.tasas_api);
}

/**
 * Uso del proveedor de tasas (OXR): distingue las llamadas reales a la API
 * (cache miss) de las reutilizaciones de caché, para este lote y en total.
 */
function imprimirTasasApi(tasas: RespuestaLote['tasas_api']): void {
  console.log(`\n${c.bold}Tasas de cambio (OXR)${c.reset}`);
  const linea = (etiqueta: string, uso: TasasApiUso) =>
    `  ${etiqueta}: ${c.bold}${uso.llamadas_api}${c.reset} llamadas reales · ` +
    `${uso.cache_hits} cache hits`;
  console.log(linea('este lote', tasas.lote));
  console.log(`${c.dim}${linea('total', tasas.total)}${c.reset}`);
}

/**
 * (a) Gráfico de estados: una grilla de celdas coloreadas (chartscii `status`),
 * una celda por gasto, agrupadas por estado, con leyenda y conteo/porcentaje.
 */
function imprimirGraficoEstados(resultados: ResultadoGasto[]): void {
  console.log(`${c.bold}Distribución de estados${c.reset}`);

  if (resultados.length === 0) {
    console.log(`  ${c.dim}(sin gastos revisados)${c.reset}\n`);
    return;
  }

  const total = resultados.length;
  const conteo = (estado: Estado) =>
    resultados.filter((r) => r.status === estado).length;

  // Una celda por gasto, en el mismo orden de los resultados (orden de gasto_id),
  // coloreada según su estado y con su gasto_id como etiqueta debajo.
  const keyDe = new Map<Estado, number>(ESTADOS.map((e) => [e.status, e.key]));
  const celdas = resultados.map((r) => ({
    value: keyDe.get(r.status) ?? 0,
    label: r.gasto_id,
  }));

  // chartscii recorta la etiqueta al ancho de la celda (`barSize`), así que la
  // hacemos al menos tan ancha como el gasto_id más largo para que se vea entero.
  const anchoCelda = Math.max(3, ...resultados.map((r) => r.gasto_id.length));

  const chart = new Chartscii(celdas, {
    type: 'status',
    barSize: anchoCelda,
    padding: 2,
    color: Object.fromEntries(ESTADOS.map((e) => [e.key, e.color])),
    legend: {
      values: ESTADOS.map((e) => {
        const n = conteo(e.status);
        const pct = ((n / total) * 100).toFixed(1);
        return `${e.status}: ${n} (${pct}%)`;
      }),
    },
  });

  console.log(chart.create());
  console.log(`${c.dim}Total revisados: ${total}${c.reset}\n`);
}

/** (b) Tabla con las filas del CSV con data errónea y el motivo. */
function imprimirTablaErrores(errores: ErrorFila[]): void {
  console.log(
    `${c.bold}Filas con data errónea (ej. montos negativos)${c.reset}`,
  );

  if (errores.length === 0) {
    console.log(`  ${c.dim}(ninguna)${c.reset}\n`);
    return;
  }

  const table = new Table({
    head: ['Fila', 'Gasto', 'Error'].map((h) => `${c.bold}${h}${c.reset}`),
  });
  for (const e of errores) {
    table.push([
      String(e.fila),
      e.gasto_id ?? `${c.dim}—${c.reset}`,
      `${c.red}${e.error}${c.reset}`,
    ]);
  }
  console.log(table.toString());
  console.log();
}

/** (c) Tabla con el resultado de cada gasto (estado y alertas). */
function imprimirTablaResultados(resultados: ResultadoGasto[]): void {
  console.log(`${c.bold}Resultados${c.reset}`);

  if (resultados.length === 0) {
    console.log(`  ${c.dim}(sin gastos revisados)${c.reset}`);
    return;
  }

  const table = new Table({
    head: ['Gasto', 'Estado', 'Alertas'].map((h) => `${c.bold}${h}${c.reset}`),
    wordWrap: true,
    colWidths: [12, 12, 60],
  });
  for (const r of resultados) {
    const fg = ESTADOS.find((e) => e.status === r.status)?.fg ?? '';
    const alertas =
      r.alertas.length === 0
        ? `${c.dim}—${c.reset}`
        : r.alertas.map((a) => `• ${a.codigo}: ${a.mensaje}`).join('\n');
    table.push([r.gasto_id, `${fg}${r.status}${c.reset}`, alertas]);
  }
  console.log(table.toString());
}

void main().catch((error: unknown) => {
  console.error(
    `${c.red}Error inesperado:${c.reset}`,
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
