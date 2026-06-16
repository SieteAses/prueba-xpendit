# prueba-xpendit

Prueba técnica de Xpendit.

- **Fase 1** — **motor de reglas de gastos** (`rules_engine`): recibe un gasto, lo
  evalúa contra la política activa de la empresa y devuelve un estado (`APROBADO`,
  `PENDIENTE`, `RECHAZADO`) junto con las alertas levantadas. Las reglas y sus
  alertas (`LIMITE_ANTIGUEDAD`, `LIMITE_FOOD`, `POLITICA_CENTRO_COSTO`)
  implementan **exactamente la tabla de políticas del PDF de la prueba**.
- **Fase 2** — **tasas de cambio reales**: convierte cada gasto a USD con la **tasa
  histórica del día** vía [Open Exchange Rates](https://openexchangerates.org),
  reemplazando las tasas fijas de la Fase 1.
- **Fase 3** — **revisión por lote (CSV)**: revisa un archivo completo, detecta
  anomalías (montos negativos y cobros duplicados), optimiza las llamadas a la API
  con caché por fecha y reporta la fecha de ejecución.

El backend está construido con **NestJS** siguiendo **Arquitectura Limpia /
Hexagonal** y desarrollado con **TDD**.

## Estructura

- [`backend/`](backend/) — API NestJS (dominio, aplicación e infraestructura).
- [`client/`](client/) — cliente de consola: sube un CSV de gastos al backend y
  muestra la revisión (gráfico de estados, tablas y uso de la API de tasas);
  incluye `analyze-csv.ts` para un análisis local sin backend. Ver
  [`client/README.md`](client/README.md).
- [`FASE_1.md`](FASE_1.md) — motor de reglas (capas, decisiones de diseño, flag `USE_STUB_DATA`).
- [`FASE_2.md`](FASE_2.md) — integración de tasas de cambio reales (endpoint, configuración del `.env`).
- [`FASE_3.md`](FASE_3.md) — revisión por lote, caché de tasas, anomalías (negativos/duplicados) y fecha de ejecución.
- [`ANALISIS.md`](ANALISIS.md) — ejecución de `review-file` sobre `gastos_historicos.csv`: confirma los estados (APROBADO/PENDIENTE/RECHAZADO) contra la tabla del PDF y registra la fecha del análisis.

## Cómo correr el backend

```bash
cd backend
pnpm install
pnpm start:dev      # desarrollo (puerto 3030 por defecto)
pnpm test           # pruebas unitarias
pnpm test:e2e       # pruebas end-to-end
```

### Tasas de cambio (Fase 2)

Por defecto se usan tasas fijas en memoria (`USE_STUB_DATA=true`). Para usar tasas
reales, configura en [`backend/.env`](backend/.env) tu app_id de Open Exchange
Rates ([plan gratuito](https://openexchangerates.org/signup/free)) y desactiva los
stubs:

```dotenv
USE_STUB_DATA=false
OPEN_EXCHANGE_RATES_APP_ID=tu_app_id_aqui
```

Detalles en [`FASE_2.md`](FASE_2.md).

## Cómo ejecutar la Fase 3 (revisión por lote, end-to-end)

La Fase 3 revisa un **archivo CSV completo** con tasas de cambio **reales** y
muestra el resultado en consola con el cliente. Sigue estos pasos en orden;
necesitarás **dos terminales** (una para el backend y otra para el cliente).

### 1. Consigue un app_id de Open Exchange Rates

Las tasas reales se piden a [Open Exchange Rates](https://openexchangerates.org).
Crea una cuenta gratuita y copia tu **App ID** (el plan
[gratuito](https://openexchangerates.org/signup/free) incluye tasas históricas,
que es lo que usa la Fase 3):

> Cuenta → *App IDs* → copia el token (una cadena larga de letras y números).

### 2. Configura el backend para usar tasas reales

Crea el archivo [`backend/.env`](backend/.env) a partir de la plantilla y
desactiva los stubs (sin esto, el backend usa tasas fijas en memoria):

```bash
cd backend
cp .env.example .env
```

Edita `backend/.env` y deja estas dos líneas así (pega tu app_id real):

```dotenv
USE_STUB_DATA=false
OPEN_EXCHANGE_RATES_APP_ID=tu_app_id_aqui
```

> `USE_STUB_DATA=false` activa el proveedor real de tasas; el `OPEN_EXCHANGE_RATES_APP_ID`
> es **obligatorio** en ese modo. Se valida de forma perezosa (al primer gasto que
> deba convertirse), no al arrancar.

### 3. Levanta el backend (terminal 1)

```bash
cd backend
pnpm install          # sólo la primera vez
pnpm start:dev        # escucha en http://localhost:3030
```

Deja esta terminal abierta y corriendo.

### 4. Ejecuta el cliente sobre un CSV (terminal 2)

En **otra** terminal, instala las dependencias del cliente y lánzalo apuntando a
un CSV (incluimos `expenses.sample.csv` como ejemplo):

```bash
cd client
pnpm install                          # sólo la primera vez
node review-file.ts ./expenses.sample.csv
```

El cliente sube el CSV a `POST /expenses/review-file` y muestra en consola:

- un **gráfico de estados** (una celda coloreada por gasto, con el `gasto_id`
  debajo, leyenda y porcentajes),
- una **tabla de filas con datos erróneos** (p. ej. montos negativos) y el motivo,
- una **tabla de resultados** (estado y alertas de cada gasto, incl. duplicados),
- el **uso de la API de tasas** (OXR): llamadas reales vs. cache hits, de este
  lote y del total acumulado.

> El backend solo llama a OXR para gastos en moneda distinta de USD; cachea por
> fecha, así que llama una vez por cada fecha distinta y reutiliza el resto.
> Puedes anticipar esas llamadas sin tocar el backend con `node analyze-csv.ts`.
> Para apuntar a otro host/puerto: `node review-file.ts ./mi.csv http://localhost:4000`.

Más detalle del cliente en [`client/README.md`](client/README.md) y de la fase en
[`FASE_3.md`](FASE_3.md).

## Analisis Fase 3

Documento del analisis de los resultados de la Fase 3 en [`client/ANALISIS.md`](client/ANALISIS.md).
Video del análisis:


https://github.com/user-attachments/assets/9c811605-2262-43fd-92b8-69f146d652f2



## CI

Cada `push` y `pull_request` a `master` ejecuta las pruebas unitarias y e2e
mediante GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
