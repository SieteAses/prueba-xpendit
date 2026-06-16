import { ReviewExpenseBatchUseCase } from '@/rules_engine/application/use-cases/review-expense-batch.use-case';
import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
import { SystemClock } from '@/rules_engine/infrastructure/clock/system-clock';
import { ExchangeRateCallCounter } from '@/rules_engine/infrastructure/exchange-rate/exchange-rate-call-counter';
import { StubExchangeRateProvider } from '@/rules_engine/infrastructure/exchange-rate/stub-exchange-rate.provider';
import { ReviewExpenseRequest } from '@/rules_engine/infrastructure/http/dto/review-expense.request';
import { ReviewPolicyController } from '@/rules_engine/infrastructure/http/review-policy.controller';
import { InMemoryPolicyRepository } from '@/rules_engine/infrastructure/persistence/in-memory-policy.repository';

/**
 * End-to-end del flujo real (sin mocks): request externo (nombres del CSV) →
 * mapper → use case → conversión de moneda (stub) → política activa (stub) →
 * respuesta externa (estado en español). Se fija "hoy" para que la regla de
 * antigüedad sea determinista.
 */
describe('ReviewPolicy (integración)', () => {
  let controller: ReviewPolicyController;

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    const clock = new SystemClock();
    const useCase = new ReviewPolicyUseCase(
      new InMemoryPolicyRepository(),
      new StubExchangeRateProvider(),
      clock,
    );
    controller = new ReviewPolicyController(
      useCase,
      new ReviewExpenseBatchUseCase(useCase),
      new ExchangeRateCallCounter(),
      clock,
    );
  });

  it("convierte CLP a USD y aplica el límite 'food' (PENDIENTE)", async () => {
    // 114.000 CLP / 950 = 120 USD → 100 < 120 ≤ 150 → PENDIENTE.
    const request: ReviewExpenseRequest = {
      gasto_id: 'g_010',
      empleado_id: 'e_005',
      empleado_nombre: 'Eva',
      empleado_apellido: 'Luna',
      empleado_cost_center: 'sales_team',
      categoria: 'food',
      monto: 114000,
      moneda: 'CLP',
      fecha: '2026-06-10', // 5 días → antigüedad APROBADA (sin alerta)
    };

    const response = await controller.review(request);

    expect(response).toEqual({
      gasto_id: 'g_010',
      status: 'PENDIENTE',
      alertas: [{ codigo: 'LIMITE_FOOD', mensaje: 'Requiere revisión' }],
    });
  });

  it('gasto en USD dentro de límites → APROBADO sin alertas', async () => {
    const request: ReviewExpenseRequest = {
      gasto_id: 'g_001',
      empleado_id: 'e_002',
      empleado_nombre: 'Bruno',
      empleado_apellido: 'Soto',
      empleado_cost_center: 'sales_team',
      categoria: 'food',
      monto: 50,
      moneda: 'USD',
      fecha: '2026-06-12', // 3 días
    };

    const response = await controller.review(request);

    expect(response).toEqual({
      gasto_id: 'g_001',
      status: 'APROBADO',
      alertas: [],
    });
  });

  it('core_engineering + food → RECHAZADO por la regla cruzada', async () => {
    const request: ReviewExpenseRequest = {
      gasto_id: 'g_013',
      empleado_id: 'e_001',
      empleado_nombre: 'Ana',
      empleado_apellido: 'Reyes',
      empleado_cost_center: 'core_engineering',
      categoria: 'food',
      monto: 45000, // ~47 USD: dentro del límite food, pero la regla cruzada rechaza
      moneda: 'CLP',
      fecha: '2026-06-11',
    };

    const response = await controller.review(request);

    expect(response.gasto_id).toBe('g_013');
    expect(response.status).toBe('RECHAZADO');
    expect(response.alertas.map((a) => a.codigo)).toEqual([
      'POLITICA_CENTRO_COSTO',
    ]);
  });

  it('reviewFile: detecta duplicado exacto (copia → PENDIENTE) y aísla el monto negativo', async () => {
    const header =
      'gasto_id,empleado_id,empleado_nombre,empleado_apellido,empleado_cost_center,categoria,monto,moneda,fecha';
    const csv = [
      header,
      'g_001,e_001,Eva,Luna,sales_team,food,50,USD,2026-06-12',
      'g_002,e_001,Eva,Luna,sales_team,food,50,USD,2026-06-12', // duplicado exacto de g_001
      'g_neg,e_001,Eva,Luna,sales_team,food,-10,USD,2026-06-12', // monto negativo → error
    ].join('\n');
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
    } as Express.Multer.File;

    const res = await controller.reviewFile(file);

    // El original pasa limpio; la copia se marca PENDIENTE con el id del original.
    expect(res.resultados[0]).toEqual({
      gasto_id: 'g_001',
      status: 'APROBADO',
      alertas: [],
    });
    expect(res.resultados[1].gasto_id).toBe('g_002');
    expect(res.resultados[1].status).toBe('PENDIENTE');
    expect(res.resultados[1].alertas[0].codigo).toBe('GASTO_DUPLICADO');
    expect(res.resultados[1].alertas[0].mensaje).toContain('g_001');

    // El monto negativo (anomalía) cae en errores, sin abortar el lote.
    expect(res.errores).toHaveLength(1);
    expect(res.errores[0]).toMatchObject({ fila: 4, gasto_id: 'g_neg' });
    expect(res.errores[0].error).toMatch(/negativ/i);

    // Sin llamadas reales a OXR: todo en USD y con el stub.
    expect(res.tasas_api.lote).toEqual({ llamadas_api: 0, cache_hits: 0 });
    expect(res.total).toBe(3);
    // La fecha de ejecución refleja el "ahora" (timers fijados en beforeAll).
    expect(res.fecha_ejecucion).toBe('2026-06-15T12:00:00.000Z');
  });
});
