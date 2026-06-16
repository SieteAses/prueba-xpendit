# Fase 3 — Revisión por lote (CSV), caché de tasas y detección de anomalías

Las Fases 1 y 2 revisaban **un gasto a la vez** (`POST /expenses/review`). La
Fase 3 incorpora la revisión de un **archivo CSV completo** y, sobre ese flujo,
añade detección de **anomalías sospechosas**, optimización de las llamadas a la
API de tasas y trazabilidad temporal del análisis.

Como en las fases anteriores, el dominio y la aplicación se mantienen
desacoplados de la infraestructura (Arquitectura Limpia) y todo se desarrolla con
TDD.

---

## 1. Nuevo caso de uso para la lectura del CSV

El endpoint `POST /expenses/review-file` recibe un archivo (`multipart/form-data`,
campo `file`) con una fila por gasto y cabeceras con los nombres externos
(`gasto_id, monto, moneda, fecha, …`). El flujo separa responsabilidades por capa:

- **Infraestructura (HTTP):** `review-policy.controller.ts` parsea el CSV con
  `csv-expense.parser.ts` (basado en `csv-parse`), aísla las filas con error de
  parseo (p. ej. monto no numérico) conservando su **número de fila**, y traduce
  cada fila al comando interno con `ReviewPolicyMapper`.
- **Aplicación (orquestación de lote):** el nuevo
  **`ReviewExpenseBatchUseCase`** recibe la lista de comandos y los revisa uno a
  uno **reutilizando el `ReviewPolicyUseCase`** existente (no se duplica la lógica
  de evaluación). Devuelve, alineado por índice, un resultado `ok` o `error` por
  fila.

Decisión de diseño: la lectura por lote es un caso de uso **propio** (no se metió
la iteración en el controller ni se mezcló con el motor de reglas por-gasto). Esto
mantiene el `ReviewPolicyUseCase` enfocado en *un* gasto y permite que el lote
añada lógica *cross-gasto* (los duplicados, ver §4) sin tocar la política.

Una fila inválida **no aborta** el lote: se reporta aparte. La única excepción es
la ausencia de política activa, que afecta a todas las filas y devuelve `503`.

---

## 2. Optimización por caché para reducir llamadas a OXR

Cada gasto en moneda distinta de la base se valora con la **tasa histórica de su
fecha** (Fase 2). En un CSV con muchas filas, valorar cada una con una llamada
HTTP independiente agotaría la cuota gratuita (1.000 peticiones/mes).

`OpenExchangeRateProvider` **cachea las tasas por fecha** (`Map<fecha, rates>`):
como las tasas históricas de un día son inmutables, todos los gastos de una misma
fecha se resuelven con **una sola** petición; el resto son aciertos de caché.

Para hacer este ahorro **observable**, se añadió un `ExchangeRateCallCounter` que
distingue:

- **llamadas reales** a la API (cache miss), y
- **reutilizaciones de caché** (cache hit).

El endpoint reporta ambos en `tasas_api`, tanto para el **lote actual** como para
el **acumulado total**:

```json
"tasas_api": {
  "lote":  { "llamadas_api": 1, "cache_hits": 4 },
  "total": { "llamadas_api": 7, "cache_hits": 23 }
}
```

La medición por lote usa `AsyncLocalStorage`, de modo que es precisa incluso con
peticiones concurrentes (cada petición contabiliza solo su propio uso).

---

## 3. Convención "todo en USD" para evitar cambios de tasa innecesarios

La moneda base del motor es **USD** (`BASE_CURRENCY`). El `ReviewPolicyUseCase`
solo invoca el puerto de tasas **cuando la moneda del gasto no es la base**:

```ts
let money = Money.create(command.amount, currency);
if (currency !== BASE_CURRENCY) {
  money = await this.exchangeRate.convert(money, BASE_CURRENCY, expenseDate);
}
```

Es decir, un gasto **ya en USD no genera ninguna conversión ni llamada a la API**.
Combinado con la caché por fecha (§2), las llamadas reales a OXR se reducen a:

> **una por cada fecha distinta que tenga al menos un gasto en moneda ≠ USD.**

Esta convención (heredada de la Fase 1) es la que permite usar el plan gratuito
de OXR sin parámetros extra y minimiza el tráfico de red en los lotes.

---

## 4. Anomalías sospechosas: montos negativos y cobros duplicados

El PDF (Parte 3) pide detectar **2 de las anomalías** "sospechosas"; se
implementan **las dos** que enumera —**montos negativos** y **duplicados
exactos** (mismo monto, moneda y fecha)—. Además de las reglas de política, el
lote detecta:

### 4.1 Montos negativos → **error** que evita procesar la fila

Un monto negativo es un dato erróneo, no un gasto válido. Es un **invariante de
dominio**: `Money.create` rechaza montos negativos, por lo que el gasto **no se
procesa** y la fila se reporta en `errores` (con su número de fila), sin abortar
el resto del lote. El mensaje es en español: *"El monto no puede ser negativo"*.

### 4.2 Cobros duplicados → alerta y estado **PENDIENTE** (revisión manual)

Un duplicado exacto es un gasto con **el mismo monto, moneda y fecha** que otro
(criterio estricto, sobre los valores crudos previos a la conversión). La
detección es un servicio puro de dominio (`detectDuplicateCopies`):

- La **primera** ocurrencia de cada grupo se considera el original y pasa limpia.
- Las **copias** (2.ª en adelante) reciben la alerta `GASTO_DUPLICADO` —que cita
  el `gasto_id` del original— y se elevan a estado **`PENDIENTE`** (salvo que la
  política ya las haya rechazado, que es más severo).

> Ambas anomalías **no se descartan ni se aprueban automáticamente**: el monto
> negativo se bloquea como error y el duplicado queda **pendiente de una revisión
> manual**. El sistema señala el problema; la decisión final es humana.

La detección de duplicados es una preocupación **de lote** (cross-gasto), por eso
vive en el caso de uso de aplicación y no en `Policy` (que evalúa un gasto
aislado).

---

## 5. Fecha de la iteración: cuándo se hizo el análisis

Las reglas dependientes de la fecha (p. ej. la antigüedad del gasto) se evalúan
respecto a **"ahora"**. Para que un resultado guardado siga siendo interpretable a
futuro, la respuesta del lote incluye **`fecha_ejecucion`** (ISO 8601): el instante
en que se ejecutó la revisión.

Así, al archivar la salida, se puede entender la **distancia temporal** entre la
fecha de cada gasto y el momento del análisis (por qué un gasto quedó pendiente
por antigüedad, por ejemplo).

El instante proviene de un puerto **`Clock`** inyectado (no de `new Date()`
directo en la aplicación), lo que mantiene la capa de aplicación pura y las
pruebas deterministas.

---

## 6. Cliente de consola (`client/`)

Para usar el endpoint de lote hay un cliente de consola (Node 24, sin
compilación):

- `review-file.ts` — sube un CSV al backend y muestra: un **gráfico de estados**,
  una **tabla de filas con data errónea** (ej. montos negativos), una **tabla de
  resultados** (con la alerta de duplicado), el **uso de la API de tasas** y la
  **fecha de ejecución**.
- `analyze-csv.ts` — análisis **local sin backend**: predice las llamadas
  esperadas a OXR y los duplicados exactos del archivo.

Detalles en [`client/README.md`](client/README.md).

---

## 7. Pruebas

Todo lo anterior está cubierto con TDD (unitarias + integración + e2e):

- `exact-duplicate-detector` — marca las copias 2.ª+ citando el original.
- `review-expense-batch.use-case` — alerta de duplicado, elevación a PENDIENTE,
  aislamiento de errores por fila, re-lanzado de "sin política activa".
- `exchange-rate-call-counter` — totales y medición aislada por petición.
- `open-exchange-rate.provider` — caché por fecha y conteo real vs. cache hit.
- `review-policy.controller` + integración end-to-end — duplicado + monto negativo
  + `tasas_api` + `fecha_ejecucion`.

```bash
cd backend
pnpm test            # unitarias + integración
pnpm test:e2e        # end-to-end
pnpm lint:check      # estilo
```
