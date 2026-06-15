---
name: issue-planner
description: Toma una issue (descripción, ticket o enlace) y produce un plan de trabajo dividido en backend y frontend, definiendo primero los criterios de aceptación, y delega la implementación a los agentes especializados. Backend sigue un enfoque TDD estricto (criterios de aceptación → pruebas → implementación). Úsala cuando el usuario quiera planificar y ejecutar una issue end-to-end.
---

# Issue Planner — Plan + delegación backend/frontend con TDD

Esta skill convierte una **issue** en un plan accionable, separa el trabajo en **backend** y **frontend**, y **delega** a los agentes especializados. El backend se desarrolla con **TDD**: los criterios de aceptación se definen y se traducen a pruebas **antes** de implementar.

Agentes disponibles a los que delegar (vía la herramienta `Agent`):
- `backend-nestjs` — implementación backend (NestJS, Arquitectura Limpia, TDD).
- `backend-testing` — pruebas unitarias backend (Jest, TDD).
- `frontend-nextjs` — implementación frontend (Next.js App Router, Arquitectura Limpia).
- `frontend-testing` — pruebas unitarias frontend (RTL/Jest).

## Procedimiento

### 1. Entender la issue
Lee la issue proporcionada (texto, ruta a archivo, o número/enlace de issue — usa `gh issue view` si es de GitHub y hay repo). Extrae: objetivo, alcance, restricciones, dependencias y dudas. Si algo crítico es ambiguo, **pregunta al usuario** antes de continuar (usa `AskUserQuestion` para decisiones que cambian el plan).

### 2. Definir criterios de aceptación (PRIMERO)
Antes de cualquier diseño técnico, redacta los **criterios de aceptación** en formato **Given / When / Then**, numerados y verificables. Sepáralos por área cuando aplique:
- Criterios de **backend** (API, reglas de negocio, persistencia, validación, errores).
- Criterios de **frontend** (estados de UI, interacciones, validación, accesibilidad, manejo de errores).

Presenta estos criterios al usuario para confirmación antes de generar los planes detallados. Son el contrato del trabajo.

### 3. Generar el plan de backend (enfoque TDD)
Estructura el plan respetando Arquitectura Limpia (domain → application → infrastructure → presentation) y el ciclo TDD:
1. **Criterios → pruebas**: lista qué pruebas escribirá `backend-testing` para cada criterio (Red).
2. **Implementación**: qué entregará `backend-nestjs` para pasar las pruebas (Green), por capa.
3. **Refactor** y wiring del módulo.
Identifica archivos/módulos afectados, puertos (interfaces) y adaptadores.

### 4. Generar el plan de frontend
Estructura el plan respetando Arquitectura Limpia en frontend (domain → application → infrastructure → presentation):
- Casos de uso de UI y puertos, adaptadores de API/mappers, componentes (server/client) y hooks.
- Qué pruebas cubrirá `frontend-testing` por criterio.
Marca la dependencia del contrato de API que define el backend.

### 5. Delegar a los agentes
Orquesta la ejecución. **Para backend respeta el orden TDD**: primero pruebas, luego implementación.

Orden recomendado:
1. Lanza `backend-testing` con los criterios de aceptación de backend → genera las pruebas que fallan (Red).
2. Lanza `backend-nestjs` con los criterios + las pruebas → implementa hasta Green y refactoriza.
3. En paralelo (si el contrato de API ya está definido) o tras el backend: lanza `frontend-testing` y `frontend-nextjs` para la parte de UI, también guiados por los criterios de frontend.

Pasa a cada agente: el resumen de la issue, **sus** criterios de aceptación, las restricciones del repo y el contrato de API acordado. Cuando delegues trabajo independiente, lanza los agentes en un solo mensaje con varias llamadas a `Agent` para que corran en paralelo; respeta las dependencias (las pruebas backend antes que la implementación backend).

### 6. Integrar y reportar
Recoge los entregables de cada agente, verifica que **cada criterio de aceptación quede cubierto por al menos una prueba** (tabla de trazabilidad), ejecuta las pruebas si es posible, y entrega al usuario un resumen: criterios, qué se implementó, estado de las pruebas y pendientes.

## Principios
- Criterios de aceptación **antes** que diseño y código. Son el contrato.
- Backend **TDD**: prueba que falla → implementación → refactor. Nunca implementación sin prueba previa.
- Mantén separadas las preocupaciones de backend y frontend; coordina el contrato de API entre ambas.
- No implementes tú directamente lo que corresponde a un agente especializado; **delega** y orquesta.
