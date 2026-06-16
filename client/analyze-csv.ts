/**
 * Analizador local de un CSV de gastos. No llama al backend: predice, a partir
 * del archivo, dos cosas que el backend producirá al revisar el lote.
 *
 *   (1) Llamadas esperadas a la API de Open Exchange Rates (OXR).
 *       El backend solo convierte gastos en una moneda distinta de la base
 *       (USD) y con monto no negativo (un monto negativo lanza antes de
 *       convertir). El proveedor cachea las tasas por fecha, así que se llama de
 *       verdad a la API una vez por cada **fecha distinta con gastos
 *       convertibles** (1.ª aparición = cache miss) y el resto son cache hits.
 *       Los gastos en USD no llaman a la API.
 *
 *   (2) Duplicados exactos esperados.
 *       Gastos con el mismo monto, moneda y fecha. De cada grupo sobrevive la
 *       1.ª ocurrencia (el original) y el resto son duplicados, que referencian
 *       el `gasto_id` del original. Espeja la lógica del backend
 *       (`detectDuplicateCopies`).
 *
 * Las filas con `monto` no numérico no llegan a convertirse en el backend (se
 * reportan como error), así que se excluyen de ambos conteos y se listan aparte.
 *
 * Uso:
 *   node analyze-csv.ts <ruta-al-csv>
 *
 * Ejemplos:
 *   node analyze-csv.ts ./expenses.sample.csv
 *
 * Requiere Node 24+ (ejecuta TypeScript de forma nativa).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import Table from 'cli-table3';

/** Moneda base del backend: los gastos en esta moneda no llaman a la API. */
const BASE_CURRENCY = 'USD';

interface Gasto {
  gasto_id: string;
  monto: number;
  moneda: string;
  fecha: string;
}

interface FilaInvalida {
  fila: number;
  gasto_id: string;
  motivo: string;
}

// Colores ANSI para texto.
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function uso(): never {
  console.error('Uso: node analyze-csv.ts <ruta-al-csv>');
  process.exit(1);
}

/** Columnas que el análisis necesita; si faltan, el archivo no es un CSV de gastos. */
const COLUMNAS_REQUERIDAS = ['gasto_id', 'monto', 'moneda', 'fecha'];

/**
 * Parser CSV mínimo que espeja el comportamiento del backend (columnas por
 * cabecera, recorta espacios, ignora líneas vacías, descarta el BOM y soporta
 * comillas dobles para comas dentro de un campo). Devuelve las cabeceras y las
 * filas como objetos indexados por cabecera.
 */
function parseCsv(content: string): {
  cabeceras: string[];
  filas: Record<string, string>[];
} {
  const rows = parseRows(content.replace(/^﻿/, ''));
  const noVacias = rows.filter((cols) => cols.some((v) => v.trim() !== ''));
  if (noVacias.length === 0) {
    return { cabeceras: [], filas: [] };
  }

  const cabeceras = noVacias[0].map((h) => h.trim());
  const filas = noVacias.slice(1).map((cols) => {
    const fila: Record<string, string> = {};
    cabeceras.forEach((h, i) => {
      fila[h] = (cols[i] ?? '').trim();
    });
    return fila;
  });
  return { cabeceras, filas };
}

/** Divide el texto en filas de celdas, respetando campos entre comillas. */
function parseRows(text: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (enComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ',') {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    uso();
  }

  const content = await readFile(filePath, 'utf8');
  const { cabeceras, filas } = parseCsv(content);

  // Falla rápido si el archivo no parece un CSV de gastos (faltan columnas).
  const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !cabeceras.includes(c));
  if (faltantes.length > 0) {
    console.error(
      `${c.red}"${basename(filePath)}" no parece un CSV de gastos.${c.reset} ` +
        `Faltan columnas: ${faltantes.join(', ')}.`,
    );
    console.error(
      `${c.dim}Cabeceras esperadas: ${COLUMNAS_REQUERIDAS.join(', ')}…${c.reset}`,
    );
    process.exit(1);
  }

  const gastos: Gasto[] = [];
  const invalidas: FilaInvalida[] = [];

  filas.forEach((fila, idx) => {
    // +2: la fila 1 son cabeceras y los índices empiezan en 0.
    const numFila = idx + 2;
    const monto = Number(fila.monto);
    if (fila.monto === undefined || fila.monto === '' || Number.isNaN(monto)) {
      invalidas.push({
        fila: numFila,
        gasto_id: fila.gasto_id || '—',
        motivo: `monto inválido: "${fila.monto ?? ''}"`,
      });
      return;
    }
    gastos.push({
      gasto_id: fila.gasto_id,
      monto,
      moneda: fila.moneda,
      fecha: fila.fecha,
    });
  });

  console.log(
    `${c.dim}Analizando ${basename(filePath)}: ${filas.length} fila(s), ` +
      `${gastos.length} procesable(s), ${invalidas.length} inválida(s).${c.reset}\n`,
  );

  imprimirLlamadasOxr(gastos);
  imprimirDuplicados(gastos);
  imprimirInvalidas(invalidas);
}

/** (1) Fechas distintas → llamadas reales a la API de OXR (y cache hits). */
function imprimirLlamadasOxr(gastos: Gasto[]): void {
  console.log(`${c.bold}Llamadas esperadas a OXR (por fecha)${c.reset}`);

  // Solo gastos convertibles: moneda distinta de la base (USD) y monto no
  // negativo. Los gastos en la base no se convierten, y un monto negativo lanza
  // antes de convertir, así que ninguno llama a la API.
  const convertibles = gastos.filter(
    (g) => g.moneda !== BASE_CURRENCY && g.monto >= 0,
  );

  if (convertibles.length === 0) {
    console.log(
      `  ${c.dim}(ninguna: todo en ${BASE_CURRENCY} o sin gastos convertibles)${c.reset}\n`,
    );
    return;
  }

  // Conteo por fecha en orden de primera aparición (como la caché del backend).
  const conteoPorFecha = new Map<string, number>();
  for (const g of convertibles) {
    conteoPorFecha.set(g.fecha, (conteoPorFecha.get(g.fecha) ?? 0) + 1);
  }

  const table = new Table({
    head: ['Fecha', 'Gastos no-USD', 'Llamada API', 'Cache hits'].map(
      (h) => `${c.bold}${h}${c.reset}`,
    ),
  });
  for (const [fecha, n] of conteoPorFecha) {
    table.push([fecha, String(n), `${c.cyan}1${c.reset}`, String(n - 1)]);
  }
  console.log(table.toString());

  const llamadasApi = conteoPorFecha.size;
  const cacheHits = convertibles.length - llamadasApi;
  console.log(
    `${c.bold}Total: ${c.cyan}${llamadasApi}${c.reset}${c.bold} llamada(s) a la API` +
      ` (fechas distintas con gastos no-${BASE_CURRENCY}), ${cacheHits} cache hit(s).${c.reset}\n`,
  );
}

/** (2) Duplicados exactos: mismo monto, moneda y fecha. */
function imprimirDuplicados(gastos: Gasto[]): void {
  console.log(`${c.bold}Duplicados exactos esperados${c.reset}`);

  const originalPorClave = new Map<string, string>();
  const duplicados: { gasto: Gasto; duplicaA: string }[] = [];

  for (const g of gastos) {
    const clave = `${g.monto}|${g.moneda}|${g.fecha}`;
    const original = originalPorClave.get(clave);
    if (original !== undefined) {
      duplicados.push({ gasto: g, duplicaA: original });
    } else {
      originalPorClave.set(clave, g.gasto_id);
    }
  }

  if (duplicados.length === 0) {
    console.log(`  ${c.dim}(ninguno)${c.reset}\n`);
    return;
  }

  const table = new Table({
    head: ['Duplicado', 'Duplica a', 'Monto', 'Moneda', 'Fecha'].map(
      (h) => `${c.bold}${h}${c.reset}`,
    ),
  });
  for (const { gasto, duplicaA } of duplicados) {
    table.push([
      `${c.yellow}${gasto.gasto_id}${c.reset}`,
      duplicaA,
      String(gasto.monto),
      gasto.moneda,
      gasto.fecha,
    ]);
  }
  console.log(table.toString());

  const gruposConDuplicados = new Set(duplicados.map((d) => d.duplicaA)).size;
  console.log(
    `${c.bold}Total: ${c.yellow}${duplicados.length}${c.reset}${c.bold} duplicado(s)` +
      ` en ${gruposConDuplicados} grupo(s).${c.reset}\n`,
  );
}

/** Filas excluidas del análisis por monto no numérico. */
function imprimirInvalidas(invalidas: FilaInvalida[]): void {
  if (invalidas.length === 0) {
    return;
  }
  console.log(`${c.bold}Filas excluidas${c.reset}`);
  const table = new Table({
    head: ['Fila', 'Gasto', 'Motivo'].map((h) => `${c.bold}${h}${c.reset}`),
  });
  for (const inv of invalidas) {
    table.push([
      String(inv.fila),
      inv.gasto_id,
      `${c.red}${inv.motivo}${c.reset}`,
    ]);
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
