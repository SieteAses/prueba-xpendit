import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
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
    const useCase = new ReviewPolicyUseCase(
      new InMemoryPolicyRepository(),
      new StubExchangeRateProvider(),
    );
    controller = new ReviewPolicyController(useCase);
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
});
