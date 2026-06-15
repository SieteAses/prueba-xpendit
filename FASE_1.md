# Fase 1 — Motor de reglas de gastos (`rules_engine`)

Esta fase implementa el **revisor de políticas**: recibe un gasto, lo evalúa
contra la política activa de la empresa y devuelve un estado (`APROBADO`,
`PENDIENTE`, `RECHAZADO`) junto con las alertas que se hayan levantado.

El backend está construido con **NestJS** siguiendo **Arquitectura Limpia /
Hexagonal**. El código del motor vive bajo `backend/src/rules_engine/` y se
organiza en tres capas: **dominio**, **aplicación** e **infraestructura**.

---

## 1. Las capas

La regla de oro es la **dirección de las dependencias**: siempre apuntan hacia
adentro. La infraestructura conoce a la aplicación; la aplicación conoce al
dominio; el dominio no conoce a nadie. Así, lo que es estable y valioso (las
reglas de negocio) no depende de detalles cambiantes (NestJS, una BD, una API
de tasas de cambio).

```
   ┌──────────────────────────────────────────────────────┐
   │  INFRAESTRUCTURA  (HTTP, persistencia, tasas, config)  │
   │   ┌──────────────────────────────────────────────┐     │
   │   │  APLICACIÓN  (casos de uso, puertos, DTOs)     │     │
   │   │     ┌────────────────────────────────────┐     │     │
   │   │     │  DOMINIO  (reglas, entidades, VOs)  │     │     │
   │   │     └────────────────────────────────────┘     │     │
   │   └──────────────────────────────────────────────┘     │
   └──────────────────────────────────────────────────────┘
            las dependencias apuntan hacia adentro →
```

### 1.1 Dominio — *las reglas del negocio*

> **Qué es:** el corazón del sistema. Modela "qué es un gasto", "qué es una
> política" y "cómo se decide si un gasto se aprueba". No sabe que existe HTTP,
> ni una base de datos, ni NestJS. Es TypeScript puro.

**Qué hace** (carpeta `domain/`):

- **Entidades** (`entities/`): objetos con identidad propia.
  - `Expense` — un gasto (monto, fecha, categoría). Sabe calcular su propia
    antigüedad en días (`ageInDaysAt`).
  - `Employee` — un empleado (nombre, centro de costo).
  - `Policy` — una política: un conjunto de reglas. Su método `evaluate()`
    corre todas las reglas y agrega el resultado (estado + alertas).
- **Value Objects** (`value-objects/`): valores sin identidad, inmutables.
  - `Money` — monto + moneda (impide montos negativos, etc.).
  - `Rule` — un criterio evaluable (ver decisión 2.a).
  - `RuleFields` — el **contrato de campos revisables** (ver decisión 2.b).
  - `Alert`, `Id`.
- **Enums** (`enums/`): `Category`, `CostCenter`, `Currency`, `RuleStatus`.
- **Servicios de dominio** (`services/`): `EvaluationContext`, que arma el
  catálogo de campos (`RuleFields`) a partir de las entidades y la fecha de
  evaluación (aquí se deriva `ageInDays`).

El dominio no tiene dependencias hacia afuera: se puede probar con `new` y sin
ningún framework.

### 1.2 Aplicación — *orquesta el caso de uso*

> **Qué es:** la capa que coordina. Dice *en qué orden* pasan las cosas para
> resolver una petición concreta, pero delega el "cómo" técnico a la
> infraestructura a través de **puertos** (interfaces).

**Qué hace** (carpeta `application/`):

- **Casos de uso** (`use-cases/`): `ReviewPolicyUseCase`. Su método
  `execute()`:
  1. Pide la política activa al repositorio (puerto).
  2. Valida y parsea los campos del comando (moneda, categoría, centro de
     costo).
  3. Normaliza el monto a la **moneda base (USD)** usando el puerto de tasas de
     cambio (sólo si hace falta).
  4. Construye las entidades `Expense` y `Employee`.
  5. Arma el `RuleFields` con `EvaluationContext` y llama a `policy.evaluate()`.
  6. Devuelve un resultado con id, estado y alertas.
- **Puertos** (`ports/`): interfaces que la aplicación *necesita* pero no
  *implementa*.
  - `PolicyRepository` — "dame la política activa".
  - `ExchangeRatePort` — "convierte este monto a esta moneda".
- **DTOs** (`dto/`): `ReviewPolicyCommand` (entrada) y `ReviewPolicyResult`
  (salida) — estructuras planas, sin lógica.
- **Errores** (`errors/`): `NoActivePolicyError`.

La aplicación depende del dominio y de **sus propias interfaces**, nunca de
implementaciones concretas. Por eso puede probarse con mocks de los puertos.

### 1.3 Infraestructura — *los detalles técnicos*

> **Qué es:** el mundo exterior y reemplazable. Aquí están NestJS, el HTTP, las
> implementaciones concretas de los puertos y la configuración. Si mañana
> cambiamos de framework o de BD, sólo cambia esta capa.

**Qué hace** (carpeta `infrastructure/`):

- **HTTP** (`http/`):
  - `ReviewPolicyController` — expone `POST /expenses/review`.
  - `ReviewPolicyMapper` — traduce entre la representación externa (campos en
    español, del CSV) y los contratos internos (ver decisión 2.d).
  - DTOs de entrada/salida (`ReviewExpenseRequest`, `ReviewExpenseResponse`).
- **Persistencia** (`persistence/`):
  - `InMemoryPolicyRepository` — **stub** con la política de la Fase 1.
  - `PendingPolicyRepository` — marcador de la BD real (fases siguientes).
- **Tasas de cambio** (`exchange-rate/`):
  - `StubExchangeRateProvider` — **stub** con tasas fijas.
  - `PendingExchangeRateProvider` — marcador de la API real (fases siguientes).
- **Configuración** (`config/`): `useStubData()` lee el flag de entorno (ver
  sección 3).
- **Módulo** (`rules-engine.module.ts`): el "cableado". Conecta cada puerto con
  su implementación según el flag `USE_STUB_DATA`.

---

## 2. Decisiones de diseño

### 2.a Reglas y políticas agnósticas

Una `Policy` no sabe *qué* evalúa cada regla; sólo sabe que tiene una lista de
reglas y que debe correrlas todas y agregar el resultado. Una `Rule`, a su vez,
no sabe de dónde salen los datos: recibe un `RuleInput` ya armado.

Cada regla se define declarativamente con tres criterios —`rejected`,
`pending`, `approve`— evaluados con precedencia **rechazo > pendiente >
aprobado**. Si ninguno aplica, la regla devuelve `null` (no opina).

```ts
Rule.create("LIMITE_FOOD", ["amount", "category"], {
  rejected: ({ amount, category }) => /* … */,
  pending:  ({ amount, category }) => /* … */,
  approve:  ({ amount, category }) => /* … */,
});
```

**Por qué:** agregar una regla nueva no toca ni `Policy` ni `Rule` —sólo se
añade una regla más a la lista—. El motor es genérico; las reglas concretas son
datos. Esto mantiene el dominio cerrado a modificación y abierto a extensión.

### 2.b `RuleFields` como contrato de campos revisables

`RuleFields` es la **única fuente de verdad** de los datos sobre los que operan
las reglas:

```ts
export interface RuleFields {
  amount: Money;
  category: Category;
  costCenter: CostCenter;
  date: Date;
  ageInDays: number; // derivado al momento de evaluar
}
```

Hay dos lados que nunca se conocen entre sí:

- El **productor** (`EvaluationContext`) arma el `RuleFields` a partir de las
  entidades y la fecha de evaluación.
- Los **consumidores** (`Rule`, `Policy`) leen del `RuleFields`.

Cada regla declara *qué subconjunto* de campos usa (`["amount", "category"]`) y
el sistema de tipos le entrega exactamente esos campos vía
`RuleInput<K> = Pick<RuleFields, K>`.

**Por qué:** es un contrato compartido y tipado. Para agregar un campo evaluable
nuevo (p. ej. "país del gasto") basta declararlo aquí y calcularlo en
`EvaluationContext`; ni `Policy` ni las reglas existentes cambian. Y como el
input de cada regla se deriva de los campos que declara, el compilador impide
que una regla lea un campo que no pidió.

### 2.c Siempre se pasa por todas las reglas (aunque la primera rechace)

`Policy.evaluate()` **no corta** al primer rechazo: evalúa **todas** las reglas,
recolecta todos los resultados y recién entonces decide el estado final
(rechazado si alguna rechaza; si no, pendiente; si no, aprobado).

**Por qué:** el objetivo del revisor es **capturar todas las alertas**, no sólo
la primera. A quien revisa un gasto le sirve ver de una vez todo lo que está
mal (excede el límite *y* es muy antiguo *y* viola la regla de centro de costo),
en lugar de arreglar un problema y reenviar para descubrir el siguiente. El
estado es un agregado; las alertas son la lista completa.

### 2.d Hacia afuera en español, internamente en inglés

- **Borde externo** (request/response HTTP, estados, alertas): en **español**,
  con los nombres de campo del CSV (`gasto_id`, `empleado_cost_center`,
  `categoria`, `monto`, `moneda`; estados `APROBADO`/`PENDIENTE`/`RECHAZADO`).
- **Dominio y aplicación**: en **inglés** y `camelCase` (`expenseId`,
  `costCenter`, `amount`, `RuleStatus.APPROVED`).

La traducción vive **en un único lugar**: `ReviewPolicyMapper` (capa de I/O).
Ni la aplicación ni el dominio conocen los nombres externos ni el idioma de
salida.

**Por qué:** el español es lo que consumen los usuarios y el formato de datos
del negocio (limpieza de cara al cliente). El inglés es el estándar de facto del
código (limpieza interna, consistencia con librerías y frameworks). Aislar la
traducción en el mapper evita que el idioma "se filtre" hacia el centro: si
mañana cambia un nombre de campo externo o se agrega otro idioma, sólo se toca
el mapper.

### 2.e Política de Fase 1 y tasas de conversión como stubs

La política activa (`current_policy`) y las tasas de cambio están **hardcodeadas
en stubs** dentro de infraestructura:

- `InMemoryPolicyRepository` siembra la política con tres reglas:
  1. **`LIMITE_ANTIGUEDAD`** — `0–30` días → aprobado; `31–60` → pendiente;
     `>60` → rechazado.
  2. **`LIMITE_FOOD`** (sólo `food`, en USD) — `≤100` → aprobado; `100–150` →
     pendiente; `>150` → rechazado.
  3. **`POLITICA_CENTRO_COSTO`** — `core_engineering` + `food` → rechazado.
- `StubExchangeRateProvider` usa tasas fijas por USD (CLP=950, EUR=0.92, …).

Ambos detrás de sus puertos (`PolicyRepository`, `ExchangeRatePort`).

**Por qué:** la Fase 1 entrega el motor de reglas funcionando *end-to-end* sin
depender todavía de una BD ni de una API de tasas. Como están detrás de puertos,
en fases siguientes se sustituyen por implementaciones reales **sin tocar la
capa de aplicación ni el dominio**. El flag `USE_STUB_DATA` (sección 3) hace ese
desacople explícito y configurable.

### 2.f Las reglas siempre se almacenan en USD (moneda base)

**Convención:** toda regla que evalúe montos expresa sus umbrales en **USD**, la
moneda base del motor (`BASE_CURRENCY`, ver
`domain/constants/base-currency.ts`). No se guardan reglas en CLP, EUR ni
ninguna otra moneda.

El flujo es siempre el mismo:

1. El gasto entra en su moneda original (`monto` + `moneda`).
2. El caso de uso (`ReviewPolicyUseCase`) normaliza el monto a USD usando el
   `ExchangeRatePort` (sólo si la moneda no es ya USD).
3. La política evalúa **monto en USD contra umbrales en USD**.

**Por qué:** las reglas son el dato más estable y valioso del sistema; las
monedas y las tasas de cambio, lo más volátil. Si una regla pudiera guardarse en
cualquier moneda, cada gasto exigiría: detectar en qué moneda está la regla,
convertir el gasto a *esa* moneda y comparar —multiplicando los caminos de
conversión y las fuentes de error—. Fijando una **única moneda base (USD)** para
todas las reglas, la conversión ocurre **una sola vez y en un solo lugar** (el
caso de uso, paso 2), y el dominio compara siempre magnitudes homogéneas. Esto
**minimiza la cantidad de cambios** al agregar reglas o monedas nuevas: una regla
nueva sólo declara umbrales en USD; una moneda nueva sólo agrega su tasa al
`ExchangeRatePort`, sin tocar ninguna regla.

> Implicación para quien define reglas: **los umbrales se escriben en USD**. Si
> mañana se quisiera cambiar la moneda base, basta con ajustar `BASE_CURRENCY` y
> reexpresar los umbrales de las reglas en esa moneda; el resto del motor no
> cambia.

---

## 3. Cómo ejecutar, probar y el flag `USE_STUB_DATA`

> Todo lo siguiente se ejecuta dentro de `backend/`. Gestor de paquetes: **pnpm**.

### 3.1 Instalar

```bash
cd backend
pnpm install
```

### 3.2 Configurar el entorno (`.env`)

```dotenv
PORT=3030
USE_STUB_DATA=true
```

### 3.3 Levantar la app

```bash
pnpm run start        # producción local
pnpm run start:dev    # watch (recarga al guardar)
```

Probar el endpoint:

```bash
curl -X POST http://localhost:3030/expenses/review \
  -H "Content-Type: application/json" \
  -d '{
    "gasto_id": "g_010",
    "empleado_id": "e_005",
    "empleado_nombre": "Eva",
    "empleado_apellido": "Luna",
    "empleado_cost_center": "sales_team",
    "categoria": "food",
    "monto": 114000,
    "moneda": "CLP",
    "fecha": "2026-06-10"
  }'
```

Respuesta esperada (114.000 CLP / 950 = 120 USD → entre 100 y 150 → pendiente):

```json
{
  "gasto_id": "g_010",
  "status": "PENDIENTE",
  "alertas": [{ "codigo": "LIMITE_FOOD", "mensaje": "Requiere revisión" }]
}
```

### 3.4 Ejecutar las pruebas

```bash
pnpm run test          # unitarias + integración (Jest)
pnpm run test:watch    # modo watch
pnpm run test:cov      # con cobertura
pnpm run test:e2e      # end-to-end (HTTP real)
```

Las pruebas cubren cada capa por separado (dominio, casos de uso con puertos
mockeados, controller, stubs de infraestructura) más un test de **integración**
del flujo completo sin mocks (`test/rules_engine/review-policy.integration.spec.ts`).
La fecha "hoy" se fija con timers falsos para que la regla de antigüedad sea
determinista.

### 3.5 El flag `USE_STUB_DATA` (desacople de la Fase 1)

El cableado del módulo (`rules-engine.module.ts`) elige la implementación de
cada puerto **según una variable de entorno**, leída por
`infrastructure/config/use-stub-data.ts`:

| `USE_STUB_DATA` | `PolicyRepository`         | `ExchangeRatePort`            | Comportamiento                                  |
| --------------- | -------------------------- | ----------------------------- | ----------------------------------------------- |
| `true`          | `InMemoryPolicyRepository` | `StubExchangeRateProvider`    | Stubs de la Fase 1 (datos en memoria, tasas fijas) |
| `false` / ausente | `PendingPolicyRepository`  | `PendingExchangeRateProvider` | Implementaciones reales (pendientes): fallan con un mensaje claro al usarse |

```ts
{
  provide: POLICY_REPOSITORY,
  useClass: useStubData() ? InMemoryPolicyRepository : PendingPolicyRepository,
},
{
  provide: EXCHANGE_RATE_PORT,
  useClass: useStubData() ? StubExchangeRateProvider : PendingExchangeRateProvider,
},
```

**Qué logra:** la Fase 1 queda **parcialmente desacoplada de las siguientes**.
Hoy se corre con `USE_STUB_DATA=true` y todo funciona con stubs. Cuando llegue
la BD real y la API de tasas, se implementan `PendingPolicyRepository` y
`PendingExchangeRateProvider` (o sus reemplazos) y se apaga el flag —**sin tocar
el caso de uso ni el dominio**—. Mientras tanto, los `Pending*` fallan de forma
explícita en lugar de devolver datos falsos en silencio, dejando claro qué falta
por implementar.

> **Actualización (Fase 2):** la tabla de arriba describe el diseño original de
> la Fase 1. En la Fase 2, el lado de `PolicyRepository` se simplificó:
> introducir una base de datos para una única política con tres reglas sería
> **overkill** para el alcance de este proyecto. Las políticas viven siempre en
> memoria (`InMemoryPolicyRepository`), el `PendingPolicyRepository` se eliminó,
> y el flag `USE_STUB_DATA` quedó dedicado **solo** a alternar el provider de
> tasas (stub fijo vs. Open Exchange Rates real). Ver `FASE_2.md`, §3.3.
