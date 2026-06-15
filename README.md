# prueba-xpendit

Prueba técnica de Xpendit. Esta **Fase 1** implementa el **motor de reglas de
gastos** (`rules_engine`): recibe un gasto, lo evalúa contra la política activa
de la empresa y devuelve un estado (`APROBADO`, `PENDIENTE`, `RECHAZADO`) junto
con las alertas levantadas.

El backend está construido con **NestJS** siguiendo **Arquitectura Limpia /
Hexagonal** y desarrollado con **TDD**.

## Estructura

- [`backend/`](backend/) — API NestJS (dominio, aplicación e infraestructura).
- [`FASE_1.md`](FASE_1.md) — documentación detallada de la Fase 1.

## Cómo correr el backend

```bash
cd backend
pnpm install
pnpm start:dev      # desarrollo (puerto 3030 por defecto)
pnpm test           # pruebas unitarias
pnpm test:e2e       # pruebas end-to-end
```

## CI

Cada `push` y `pull_request` a `master` ejecuta las pruebas unitarias y e2e
mediante GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
