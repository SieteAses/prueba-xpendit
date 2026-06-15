# Fase 2 — Tasas de cambio reales con tasa histórica por fecha

La Fase 1 normalizaba los montos a USD con **tasas fijas en memoria**
(`StubExchangeRateProvider`). Eso permitía correr el motor *end-to-end*, pero
una tasa fija no refleja el valor real de un gasto: 950 CLP no valen lo mismo en
USD hoy que hace seis meses.

La Fase 2 sustituye ese stub por una integración real con
[**Open Exchange Rates**](https://openexchangerates.org), convirtiendo cada gasto
con **la tasa del día en que ocurrió**. El cambio es solo de infraestructura: el
dominio y la capa de aplicación quedan intactos, porque la conversión vive
detrás del puerto `ExchangeRatePort`.

---

## 1. El endpoint elegido: `historical/{fecha}.json`

```
GET https://openexchangerates.org/api/historical/{YYYY-MM-DD}.json?app_id={APP_ID}
```

Devuelve todas las tasas de cambio publicadas para **un día concreto** (datos
desde 1999), expresadas como *unidades de cada moneda por 1 USD*:

```json
{
  "base": "USD",
  "timestamp": 1449877801,
  "rates": { "CLP": 950.0, "EUR": 0.92, "GBP": 0.79, "MXN": 17.1, "...": 0 }
}
```

### ¿Por qué `historical` y no `convert`?

Open Exchange Rates ofrece varios endpoints. Se evaluaron tres:

| Endpoint                          | ¿Acepta fecha? | Plan requerido | ¿Sirve? |
| --------------------------------- | -------------- | -------------- | ------- |
| `historical/{fecha}.json`         | ✅ Sí          | **Gratuito**   | ✅ **Sí** |
| `convert/{valor}/{from}/{to}`     | ❌ No (tasa actual) | Unlimited (de pago) | ❌ No |
| `latest.json`                     | ❌ No (tasa actual) | Gratuito | ❌ No (sin fecha) |

- **`convert` se descartó**: aunque parezca el más directo, sólo convierte con la
  tasa **actual** y además requiere el plan **Unlimited** (el más caro). Para
  valorar un gasto pasado con la tasa de su día, no sirve.
- **`historical` es el correcto**: es el único que toma una fecha, y está incluido
  en el **plan gratuito** (1.000 peticiones/mes, datos históricos diarios).

---

## 2. La facilidad de usar USD como moneda base

La decisión de la Fase 1 de almacenar todas las reglas en **USD** (ver
`FASE_1.md`, decisión 2.f) encaja de forma natural con el plan gratuito de la API,
y eso simplifica la integración:

- El plan gratuito **no permite cambiar la moneda base** (el parámetro `base` es
  una *"advanced query"* reservada a planes de pago). Su base es **siempre USD**.
- Pero **no necesitamos cambiarla**: nuestra moneda base ya es USD, y siempre
  convertimos *hacia* USD para evaluar las políticas.

Como la respuesta trae las tasas "por 1 USD", convertir cualquier moneda a USD es
una sola división —exactamente la misma fórmula que ya usaba el stub—:

```
montoUSD = monto / rates[monedaOrigen]
```

Por ejemplo, un gasto de `950 CLP` con `rates["CLP"] = 950` → `950 / 950 = 1 USD`.

> En otras palabras: la convención "todo en USD" no sólo simplifica el dominio
> (Fase 1); también permite usar Open Exchange Rates **sin pagar** y sin un solo
> parámetro extra.

---

## 3. Qué se implementó

Todo el cambio está contenido en la capa de **infraestructura** más un ajuste
mínimo en el puerto.

### 3.1 El puerto ahora recibe la fecha

`ExchangeRatePort.convert()` pasó de `(money, target)` a
`(money, target, date)`. La fecha es imprescindible: es lo que distingue una tasa
histórica de la actual.

```ts
// application/ports/exchange-rate.port.ts
convert(money: Money, target: Currency, date: Date): Promise<Money>;
```

`ReviewPolicyUseCase` pasa la fecha del propio gasto:

```ts
money = await this.exchangeRate.convert(money, BASE_CURRENCY, expenseDate);
```

### 3.2 `OpenExchangeRateProvider`

Nuevo adaptador en
`infrastructure/exchange-rate/open-exchange-rate.provider.ts`. Responsabilidades:

- Formatea la fecha a `YYYY-MM-DD` (UTC) y llama al endpoint `historical`.
- Calcula `montoUSD = monto / rates[origen]` y redondea a 2 decimales.
- **Cachea las tasas por fecha** en memoria (`Map<fecha, rates>`): las tasas
  históricas de un día son inmutables, así que varios gastos del mismo día se
  resuelven con **una sola** petición, cuidando el límite mensual gratuito.
- Propaga errores claros (clave inválida, cuota agotada `429`, moneda ausente).

El cliente HTTP usa el `fetch` nativo de Node (sin dependencias nuevas) y se
**inyecta** en el provider, de modo que en las pruebas se simula sin red.

### 3.3 Cableado y configuración

`rules-engine.module.ts` elige el provider según `USE_STUB_DATA`:

- `USE_STUB_DATA=true` → `StubExchangeRateProvider` (tasas fijas, desarrollo offline).
- `USE_STUB_DATA=false` → `OpenExchangeRateProvider` (tasas reales).

El antiguo `PendingExchangeRateProvider` (marcador que fallaba a propósito) ya no
es necesario y se eliminó.

---

## 4. Cómo activarlo: `.env` con app_id + `USE_STUB_DATA=false`

### 4.1 Conseguir un `app_id`

Regístrate en el **plan gratuito** (incluye datos históricos):
👉 https://openexchangerates.org/signup/free

Copia tu **App ID** desde el panel de Open Exchange Rates.

### 4.2 Configurar `.env` (dentro de `backend/`)

```dotenv
PORT=3030

# Tasas reales: false cablea OpenExchangeRateProvider.
USE_STUB_DATA=false

# Open Exchange Rates (sólo se leen cuando USE_STUB_DATA=false).
OPEN_EXCHANGE_RATES_APP_ID=tu_app_id_aqui
OPEN_EXCHANGE_RATES_BASE_URL=https://openexchangerates.org/api
```

- `OPEN_EXCHANGE_RATES_APP_ID` es **obligatorio** cuando `USE_STUB_DATA=false`. Si
  falta, la app falla al arrancar con un mensaje explícito.
- `OPEN_EXCHANGE_RATES_BASE_URL` es opcional (tiene ese valor por defecto).
- El `.env` está en `.gitignore`: la clave **no se versiona**.

> Para desarrollo y pruebas sin red ni clave, deja `USE_STUB_DATA=true`: se usan
> las tasas fijas del stub.

### 4.3 Probar la conversión con tasa histórica

```bash
cd backend
pnpm run start:dev
```

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

El monto se convierte a USD usando la tasa **CLP/USD del 2026-06-10**, no una tasa
fija, y luego se evalúa la política.

---

## 5. Pruebas

`OpenExchangeRateProvider` se prueba con el cliente HTTP simulado (sin red):
conversión correcta, formato de fecha/URL, redondeo a 2 decimales, **uso de la
caché** (mismo día → una sola llamada; día distinto → nueva llamada) y manejo de
errores (moneda ausente, fallo HTTP).

```bash
cd backend
pnpm run test        # unitarias + integración
pnpm run lint:check  # estilo
```

---

## 6. Notas y límites

- **Fines de semana / feriados:** `historical` devuelve la última tasa publicada
  del día UTC solicitado, así que siempre hay un valor.
- **Cuota gratuita:** 1.000 peticiones/mes. La caché por fecha reduce el consumo;
  si se necesita más volumen o tasas intradía, evaluar el plan Developer.
