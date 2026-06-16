---
name: issue-planner
description: Toma una issue (descripción, ticket o enlace) y produce un plan de trabajo de backend, definiendo primero los criterios de aceptación, y delega la implementación a los agentes especializados. Sigue un enfoque TDD estricto (criterios de aceptación → pruebas → implementación). Úsala cuando el usuario quiera planificar y ejecutar una issue de backend end-to-end.
---

# Issue Planner — Plan + delegación backend con TDD

Esta skill convierte una **issue** en un plan accionable de **backend** y **delega** a los agentes especializados. El backend se desarrolla con **TDD**: los criterios de aceptación se definen y se traducen a pruebas **antes** de implementar.

Agentes disponibles a los que delegar (vía la herramienta `Agent`):
- `backend-nestjs` — implementación backend (NestJS, Arquitectura Limpia, TDD).
- `backend-testing` — pruebas unitarias backend (Jest, TDD).

## Procedimiento

### 1. Entender la issue
Lee la issue proporcionada (texto, ruta a archivo, o número/enlace de issue — usa `gh issue view` si es de GitHub y hay repo). Extrae: objetivo, alcance, restricciones, dependencias y dudas. Si algo crítico es ambiguo, **pregunta al usuario** antes de continuar (usa `AskUserQuestion` para decisiones que cambian el plan).

### 2. Definir criterios de aceptación (PRIMERO)
Antes de cualquier diseño técnico, redacta los **criterios de aceptación** en formato **Given / When / Then**, numerados y verificables. Cubre: API, reglas de negocio, persistencia, validación y manejo de errores.

Presenta estos criterios al usuario para confirmación antes de generar el plan detallado. Son el contrato del trabajo.

### 3. Generar el plan de backend (enfoque TDD)
Estructura el plan respetando Arquitectura Limpia (domain → application → infrastructure → presentation) y el ciclo TDD:
1. **Criterios → pruebas**: lista qué pruebas escribirá `backend-testing` para cada criterio (Red).
2. **Implementación**: qué entregará `backend-nestjs` para pasar las pruebas (Green), por capa.
3. **Refactor** y wiring del módulo.
Identifica archivos/módulos afectados, puertos (interfaces) y adaptadores.

### 4. Delegar a los agentes
Orquesta la ejecución. **Respeta el orden TDD**: primero pruebas, luego implementación.

Orden recomendado:
1. Lanza `backend-testing` con los criterios de aceptación → genera las pruebas que fallan (Red).
2. Lanza `backend-nestjs` con los criterios + las pruebas → implementa hasta Green y refactoriza.

Pasa a cada agente: el resumen de la issue, los criterios de aceptación y las restricciones del repo. Respeta las dependencias (las pruebas antes que la implementación).

### 5. Integrar y reportar
Recoge los entregables de cada agente, verifica que **cada criterio de aceptación quede cubierto por al menos una prueba** (tabla de trazabilidad), ejecuta las pruebas si es posible, y entrega al usuario un resumen: criterios, qué se implementó, estado de las pruebas y pendientes.

## Principios
- Criterios de aceptación **antes** que diseño y código. Son el contrato.
- Backend **TDD**: prueba que falla → implementación → refactor. Nunca implementación sin prueba previa.
- No implementes tú directamente lo que corresponde a un agente especializado; **delega** y orquesta.
