# prueba-xpendit

Prueba técnica de Xpendit.

- **Fase 1** — **motor de reglas de gastos** (`rules_engine`): recibe un gasto, lo
  evalúa contra la política activa de la empresa y devuelve un estado (`APROBADO`,
  `PENDIENTE`, `RECHAZADO`) junto con las alertas levantadas.
- **Fase 2** — **tasas de cambio reales**: convierte cada gasto a USD con la **tasa
  histórica del día** vía [Open Exchange Rates](https://openexchangerates.org),
  reemplazando las tasas fijas de la Fase 1.

El backend está construido con **NestJS** siguiendo **Arquitectura Limpia /
Hexagonal** y desarrollado con **TDD**.

## Estructura

- [`backend/`](backend/) — API NestJS (dominio, aplicación e infraestructura).
- [`FASE_1.md`](FASE_1.md) — motor de reglas (capas, decisiones de diseño, flag `USE_STUB_DATA`).
- [`FASE_2.md`](FASE_2.md) — integración de tasas de cambio reales (endpoint, configuración del `.env`).

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

## CI

Cada `push` y `pull_request` a `master` ejecuta las pruebas unitarias y e2e
mediante GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
