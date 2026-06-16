# Cliente de consola — revisión de gastos por CSV

Script que sube un archivo CSV de gastos al backend (`POST /expenses/review-file`)
y muestra en consola:

- **(a)** un gráfico de estados (grilla coloreada con `chartscii`: una celda por
  gasto, con leyenda y porcentajes),
- **(b)** una tabla con las filas que fallaron y el motivo,
- **(c)** una tabla con el resultado (estado y alertas) de cada gasto —incluida
  la alerta `GASTO_DUPLICADO` para duplicados exactos,
- **(d)** el uso de la API de tasas (OXR): llamadas reales vs. cache hits, de
  este lote y del acumulado total.

Requiere **Node 24+** (ejecuta TypeScript de forma nativa, sin compilación, y
trae `fetch`/`FormData`/`Blob` globales). Usa dos dependencias:
[`chartscii`](https://www.npmjs.com/package/chartscii) y
[`cli-table3`](https://www.npmjs.com/package/cli-table3).

## Uso

1. Instala dependencias (una sola vez):

   ```bash
   cd client && pnpm install
   ```

2. Levanta el backend en otra terminal:

   ```bash
   cd backend && pnpm start
   ```

3. Ejecuta el cliente con la ruta a un CSV:

   ```bash
   cd client
   node review-file.ts ./expenses.sample.csv
   ```

   O con los scripts de npm/pnpm:

   ```bash
   pnpm review ./expenses.sample.csv   # CSV propio
   pnpm review:sample                  # usa expenses.sample.csv
   ```

## Análisis local del CSV (sin backend)

`analyze-csv.ts` predice, a partir del archivo y **sin llamar al backend**, dos
cosas que el backend producirá al revisar el lote:

- **Llamadas esperadas a OXR**: el backend solo convierte gastos en moneda
  distinta de la base (USD) y con monto no negativo; el proveedor cachea por
  fecha, así que se llama de verdad a la API una vez por cada **fecha distinta
  con gastos convertibles** (1.ª aparición = cache miss) y el resto son cache
  hits. Los gastos en USD no llaman a la API.
- **Duplicados exactos esperados**: gastos con el mismo monto, moneda y fecha; de
  cada grupo sobrevive la 1.ª ocurrencia (el original) y el resto se listan como
  duplicados, citando el `gasto_id` del original.

Las filas con `monto` no numérico se excluyen de ambos conteos (no llegan a
convertirse en el backend) y se listan aparte.

```bash
cd client
node analyze-csv.ts ./expenses.sample.csv
# o
pnpm analyze ./expenses.sample.csv
pnpm analyze:sample
```

### URL del backend

Por defecto apunta a `http://localhost:3030`. Para cambiarlo:

```bash
node review-file.ts ./expenses.sample.csv http://localhost:4000
# o
API_URL=http://localhost:4000 node review-file.ts ./expenses.sample.csv
```

## Formato del CSV

Primera fila = cabeceras con los nombres externos. Una fila por gasto:

```csv
gasto_id,empleado_id,empleado_nombre,empleado_apellido,empleado_cost_center,categoria,monto,moneda,fecha
g_001,e_001,Eva,Luna,sales_team,food,100,USD,2026-05-13
```

- `monto`: número.
- `moneda`: código ISO (USD, EUR, CLP, …).
- `categoria`: `food`, `software`, `transport`, `other`, `lodging`.
- `empleado_cost_center`: `sales_team`, `core_engineering`, `marketing`, `finance`.
- `fecha`: ISO 8601 (`YYYY-MM-DD`).

Las filas inválidas (p. ej. monto no numérico o moneda desconocida) se reportan
aparte como errores, sin abortar el resto del lote. Ver `expenses.sample.csv`
como ejemplo (incluye una fila inválida a propósito).
