# Análisis de ejecución — `gastos_historicos.csv`

Revisión por lote (Fase 3) del archivo
[`client/gastos_historicos.csv`](client/gastos_historicos.csv) (50 gastos),
ejecutada con el cliente de consola contra el backend con **tasas de cambio
reales** (`USE_STUB_DATA=false`, Open Exchange Rates).

- **Fecha de ejecución del análisis (`fecha_ejecucion`):** `2026-06-16T21:35:18.529Z` (UTC).
- **Comando:** `cd client && node review-file.ts ./gastos_historicos.csv`
- **Resultado:** 50 gastos revisados, **0 filas con datos erróneos**.

> La **antigüedad en días** de cada gasto se calcula respecto a esa fecha de
> ejecución; si se vuelve a correr otro día, los estados que dependen de la
> antigüedad pueden cambiar. Este documento refleja la corrida del 2026-06-16.

Este archivo responde las **tres preguntas del PDF (Parte 3)**:

1. [Desglose de gastos por estado](#resumen-de-estados) → **8 APROBADOS · 17 PENDIENTES · 25 RECHAZADOS**.
2. [Anomalías encontradas (con ejemplos)](#anomalías-detectadas) → 0 montos negativos · 9 duplicados exactos.
3. [Bonus: optimización de llamadas a la API (N+1)](#bonus-optimización-de-llamadas-a-oxr-evitar-n1).

## Reglas y alertas evaluadas (tabla del PDF)

Las reglas y sus alertas se implementan **exactamente según la tabla de
políticas del PDF de la prueba**:

| Alerta | Regla | APROBADO | PENDIENTE | RECHAZADO |
| --- | --- | --- | --- | --- |
| `LIMITE_ANTIGUEDAD` | Antigüedad del gasto (días) | 0–30 | 31–60 | > 60 |
| `LIMITE_FOOD` | Monto de `food` (en USD, tras convertir) | ≤ 100 | 100–150 | > 150 |
| `POLITICA_CENTRO_COSTO` | `core_engineering` + `food` | — | — | siempre RECHAZADO |

Además, la revisión por lote añade una anomalía **cross-gasto** (no está en la
política por gasto, sino que se detecta sobre el lote):

| Alerta | Regla | Efecto |
| --- | --- | --- |
| `GASTO_DUPLICADO` | Mismo **monto + moneda + fecha** que un gasto anterior del lote | La copia se eleva a **PENDIENTE** (salvo que ya esté RECHAZADA); el original pasa sin marca |

**Estado final = el más severo entre las reglas que aplican** (RECHAZADO ›
PENDIENTE › APROBADO). Un gasto puede acumular varias alertas (p. ej.
antigüedad + monto), y el estado refleja la peor de ellas.

## Resumen de estados

| Estado | Cantidad | % |
| --- | --- | --- |
| 🟢 APROBADO | **8** | 16.0 % |
| 🟡 PENDIENTE | **17** | 34.0 % |
| 🔴 RECHAZADO | **25** | 50.0 % |
| **Total** | **50** | 100 % |

En el cliente, el **gráfico de estados** muestra una celda coloreada por gasto
(verde/ámbar/rojo) con el `gasto_id` debajo, en el orden de la tabla siguiente.

## Confirmación de los estados

Se verificaron los 50 gastos contra la tabla del PDF; **todos los APROBADO,
PENDIENTE y RECHAZADO son correctos**. Casos representativos que confirman cada
límite:

**APROBADO (8)** — pasan todas las reglas aplicables:
- `g_001` food 50 USD, 19 días → monto ≤ 100 y antigüedad ≤ 30. ✓
- `g_045` food **100** USD, 19 días → monto en el límite exacto (≤ 100 = aprobado). ✓
- `g_049` software 300 USD, `core_engineering`, 9 días → el límite de monto
  solo aplica a `food` y la regla de centro de costo solo a `food`; software sin
  límite → APROBADO. ✓
- `g_024` lodging 50 USD, `core_engineering`, 7 días → la regla de centro de
  costo **no** aplica (no es `food`). ✓

**PENDIENTE (17)** — una sola regla las deja en revisión:
- `g_002` food 120 USD, 24 días → monto en (100, 150] → `LIMITE_FOOD`. ✓
- `g_004` food 81000 **CLP**, 34 días → convertido ≤ 100 USD (sin `LIMITE_FOOD`),
  pero antigüedad 31–60 → `LIMITE_ANTIGUEDAD`. ✓
- `g_041` transport 70 USD, 19 días → APROBADO por regla, pero es copia de
  `g_036` → `GASTO_DUPLICADO` lo eleva a PENDIENTE. ✓

**RECHAZADO (25)** — al menos una regla las rechaza:
- `g_003` food 160 USD → monto > 150 → `LIMITE_FOOD` rechaza. ✓
- `g_006` food 144000 **CLP**, 39 días → convertido > 150 USD → `LIMITE_FOOD`
  rechaza (a pesar de que la antigüedad sola sería PENDIENTE). ✓
- `g_016` software 50 USD, 75 días → antigüedad > 60 → `LIMITE_ANTIGUEDAD`
  rechaza (el monto no aplica a software). ✓
- `g_011` food 50 USD, `core_engineering` → `POLITICA_CENTRO_COSTO` rechaza
  (además es duplicado de `g_001`). ✓

### Detalle por gasto

| Gasto | Categoría | Centro de costo | Monto | Antigüedad (días) | Estado | Alertas |
| --- | --- | --- | --- | ---: | --- | --- |
| g_001 | food | sales_team | 50 USD | 19 | 🟢 APROBADO | — |
| g_002 | food | sales_team | 120 USD | 24 | 🟡 PENDIENTE | LIMITE_FOOD |
| g_003 | food | sales_team | 160 USD | 29 | 🔴 RECHAZADO | LIMITE_FOOD |
| g_004 | food | sales_team | 81000 CLP | 34 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_005 | food | sales_team | 126000 CLP | 38 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_006 | food | sales_team | 144000 CLP | 39 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_007 | food | marketing | 1750 MXN | 44 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_008 | food | marketing | 2100 MXN | 49 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_009 | food | marketing | 3500 MXN | 54 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_010 | food | finance | 92 EUR | 59 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_011 | food | core_engineering | 50 USD | 19 | 🔴 RECHAZADO | POLITICA_CENTRO_COSTO, GASTO_DUPLICADO |
| g_012 | food | core_engineering | 120 USD | 24 | 🔴 RECHAZADO | LIMITE_FOOD, POLITICA_CENTRO_COSTO, GASTO_DUPLICADO |
| g_013 | food | core_engineering | 45000 CLP | 29 | 🔴 RECHAZADO | POLITICA_CENTRO_COSTO |
| g_014 | software | core_engineering | 75 USD | 34 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_015 | transport | core_engineering | 150 USD | 38 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_016 | software | sales_team | 50 USD | 75 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_017 | other | marketing | 50 USD | 85 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_018 | lodging | finance | 50 USD | 90 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_019 | software | sales_team | 50 USD | 118 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_020 | transport | core_engineering | 50 USD | 127 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_021 | other | sales_team | 50 USD | 135 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_022 | software | marketing | 50 USD | 155 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_023 | lodging | finance | 50 USD | 171 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_024 | lodging | core_engineering | 50 USD | 7 | 🟢 APROBADO | — |
| g_025 | food | sales_team | 120 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_026 | food | sales_team | 160 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_027 | food | sales_team | 80 USD | 145 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_028 | food | sales_team | 120 USD | 145 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD |
| g_029 | food | core_engineering | 120 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, LIMITE_FOOD, POLITICA_CENTRO_COSTO, GASTO_DUPLICADO |
| g_030 | transport | marketing | 500 MXN | 64 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_031 | lodging | finance | 180 USD | 9 | 🟢 APROBADO | — |
| g_032 | transport | sales_team | 75 USD | 14 | 🟢 APROBADO | — |
| g_033 | software | marketing | 200 USD | 108 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_034 | transport | finance | 85 USD | 44 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_035 | software | core_engineering | 120 USD | 59 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_036 | transport | sales_team | 70 USD | 19 | 🟢 APROBADO | — |
| g_037 | other | sales_team | 150 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_038 | lodging | marketing | 130 EUR | 59 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_039 | other | finance | 150 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, GASTO_DUPLICADO |
| g_040 | transport | core_engineering | 90 USD | 49 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_041 | transport | sales_team | 70 USD | 19 | 🟡 PENDIENTE | GASTO_DUPLICADO |
| g_042 | food | sales_team | 90 USD | 14 | 🟢 APROBADO | — |
| g_043 | food | sales_team | 90 USD | 14 | 🟡 PENDIENTE | GASTO_DUPLICADO |
| g_044 | food | sales_team | 90 USD | 14 | 🟡 PENDIENTE | GASTO_DUPLICADO |
| g_045 | food | sales_team | 100 USD | 19 | 🟢 APROBADO | — |
| g_046 | other | finance | 150 USD | 39 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD |
| g_047 | other | finance | 150 USD | 99 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD, GASTO_DUPLICADO |
| g_048 | other | finance | 150 USD | 145 | 🔴 RECHAZADO | LIMITE_ANTIGUEDAD |
| g_049 | software | core_engineering | 300 USD | 9 | 🟢 APROBADO | — |
| g_050 | lodging | marketing | 130 EUR | 59 | 🟡 PENDIENTE | LIMITE_ANTIGUEDAD, GASTO_DUPLICADO |

## Anomalías detectadas

El PDF pide detectar **2 anomalías sospechosas**; el sistema implementa **las dos
que enumera**: montos negativos y duplicados exactos.

### Montos negativos — **0 encontrados** en este archivo

`gastos_historicos.csv` no contiene montos negativos ni no numéricos: las 50
filas se procesaron sin errores. Aun así, el sistema **sí los detecta**: un monto
negativo (o no numérico) se trata como dato erróneo —`Money.create` lo rechaza—,
la fila **no se procesa** y se reporta aparte en la tabla de *errores* (con su
número de fila), sin abortar el resto del lote.

> **Ejemplo** (del archivo de muestra `client/expenses.sample.csv`, que incluye
> casos erróneos a propósito): `g_003` con `monto = -45000 CLP` →
> *"El monto no puede ser negativo"*; `g_bad` con `monto = "abc"` →
> *"monto inválido: \"abc\""*. Ambas filas se listan como errores y el resto del
> lote continúa.

### Duplicados exactos — **9 encontrados**

El duplicado se define por **monto + moneda + fecha** idénticos (criterio estricto
del PDF; **no depende del empleado**, por eso `g_011` se marca como copia de
`g_001` aunque sean personas distintas). Sobrevive la primera ocurrencia (el
original); las copias reciben la alerta `GASTO_DUPLICADO` y se elevan a PENDIENTE
(salvo que la política ya las rechazara):

| Copia | Original | Monto · moneda · fecha |
| --- | --- | --- |
| g_011 | g_001 | 50 USD · 2026-05-28 |
| g_012 | g_002 | 120 USD · 2026-05-23 |
| g_029 | g_025 | 120 USD · 2026-03-09 |
| g_039 | g_037 | 150 USD · 2026-03-09 |
| g_041 | g_036 | 70 USD · 2026-05-28 |
| g_043 | g_042 | 90 USD · 2026-06-02 |
| g_044 | g_042 | 90 USD · 2026-06-02 |
| g_047 | g_037 | 150 USD · 2026-03-09 |
| g_050 | g_038 | 130 EUR · 2026-04-18 |

## Bonus: optimización de llamadas a OXR (evitar N+1)

Una solución *naive* haría **una llamada a la API por cada fila** del CSV
(problema N+1): 50 filas → hasta 50 peticiones. La solución optimizada reduce eso
con **dos mecanismos** combinados:

1. **No convertir lo que ya está en la moneda base.** Los gastos en USD (la
   moneda base) no llaman a la API: solo se convierten los 11 gastos en CLP, MXN
   o EUR.
2. **Caché por fecha.** Las tasas históricas de un día son inmutables, así que
   todos los gastos de una misma fecha se resuelven con **una sola** petición; el
   resto son aciertos de caché.

Resultado medido en este lote (`tasas_api.lote`):

- **9 llamadas reales · 2 cache hits** (11 conversiones en total).
- Las 2 cache hits corresponden a la fecha `2026-04-18`, que aparece en 3 gastos
  en EUR (`g_010`, `g_038`, `g_050`): 1 llamada real + 2 reutilizaciones.

Es decir, de 50 filas se pasó de **hasta 50 peticiones** (naive) a **9** reales:
una por cada fecha distinta con al menos un gasto en moneda ≠ USD.
