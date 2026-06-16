import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReviewPolicyCommand } from '@/rules_engine/application/dto/review-policy.command';
import { ReviewPolicyResult } from '@/rules_engine/application/dto/review-policy.result';
import { NoActivePolicyError } from '@/rules_engine/application/errors/no-active-policy.error';
import {
  BatchItemOutcome,
  DUPLICATE_ALERT_CODE,
  ReviewExpenseBatchUseCase,
} from '@/rules_engine/application/use-cases/review-expense-batch.use-case';
import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { ExchangeRateCallCounter } from '@/rules_engine/infrastructure/exchange-rate/exchange-rate-call-counter';
import { ReviewExpenseRequest } from '@/rules_engine/infrastructure/http/dto/review-expense.request';
import { ReviewPolicyController } from '@/rules_engine/infrastructure/http/review-policy.controller';

describe('ReviewPolicyController', () => {
  let useCase: { execute: jest.Mock };
  let batch: {
    execute: jest.Mock<Promise<BatchItemOutcome[]>, [ReviewPolicyCommand[]]>;
  };
  let counter: ExchangeRateCallCounter;
  let controller: ReviewPolicyController;

  // Petición con nombres de campo externos (los del CSV).
  const request: ReviewExpenseRequest = {
    gasto_id: 'g_004',
    empleado_id: 'e_005',
    empleado_nombre: 'Eva',
    empleado_apellido: 'Luna',
    empleado_cost_center: 'sales_team',
    categoria: 'food',
    monto: 81000,
    moneda: 'CLP',
    fecha: '2026-05-13',
  };

  beforeEach(() => {
    useCase = { execute: jest.fn() };
    batch = {
      execute: jest.fn<Promise<BatchItemOutcome[]>, [ReviewPolicyCommand[]]>(),
    };
    counter = new ExchangeRateCallCounter();
    const clock = { now: () => new Date('2026-06-16T00:00:00Z') };
    controller = new ReviewPolicyController(
      useCase as unknown as ReviewPolicyUseCase,
      batch as unknown as ReviewExpenseBatchUseCase,
      counter,
      clock,
    );
  });

  describe('review (un gasto)', () => {
    it('traduce la petición externa al comando interno (camelCase)', async () => {
      useCase.execute.mockResolvedValue({
        expenseId: 'g_004',
        status: RuleStatus.APPROVED,
        alerts: [],
      });

      await controller.review(request);

      expect(useCase.execute).toHaveBeenCalledWith({
        expenseId: 'g_004',
        employeeId: 'e_005',
        employeeFirstName: 'Eva',
        employeeLastName: 'Luna',
        costCenter: 'sales_team',
        category: 'food',
        amount: 81000,
        currency: 'CLP',
        date: '2026-05-13',
      });
    });

    it('traduce el resultado interno a la respuesta externa (estado en español)', async () => {
      const result: ReviewPolicyResult = {
        expenseId: 'g_004',
        status: RuleStatus.REJECTED,
        alerts: [
          { code: 'AMOUNT_OVER_LIMIT', message: 'El monto supera 5000 USD' },
        ],
      };
      useCase.execute.mockResolvedValue(result);

      await expect(controller.review(request)).resolves.toEqual({
        gasto_id: 'g_004',
        status: 'RECHAZADO',
        alertas: [
          { codigo: 'AMOUNT_OVER_LIMIT', mensaje: 'El monto supera 5000 USD' },
        ],
      });
    });

    it('traduce errores de validación a 400 (BadRequest)', async () => {
      useCase.execute.mockRejectedValue(new Error('currency inválido: "XXX"'));

      await expect(controller.review(request)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('traduce la ausencia de política activa a 503 (ServiceUnavailable)', async () => {
      useCase.execute.mockRejectedValue(new NoActivePolicyError());

      await expect(controller.review(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('reviewFile', () => {
    const header =
      'gasto_id,empleado_id,empleado_nombre,empleado_apellido,empleado_cost_center,categoria,monto,moneda,fecha';

    const fileFrom = (csv: string) =>
      ({ buffer: Buffer.from(csv, 'utf-8') }) as Express.Multer.File;

    // Construye una fila CSV con valores por defecto válidos.
    const row = (
      gastoId: string,
      o: { monto?: string; moneda?: string } = {},
    ) =>
      [
        gastoId,
        'e_001',
        'Eva',
        'Luna',
        'sales_team',
        'food',
        o.monto ?? '100',
        o.moneda ?? 'USD',
        '2026-05-13',
      ].join(',');

    const ok = (
      expenseId: string,
      status: RuleStatus = RuleStatus.APPROVED,
      alerts: { code: string; message: string }[] = [],
    ): BatchItemOutcome => ({
      kind: 'ok',
      result: { expenseId, status, alerts },
    });

    it('lanza 400 si no se envía archivo', async () => {
      await expect(controller.reviewFile(undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(batch.execute).not.toHaveBeenCalled();
    });

    it('mapea outcomes ok a resultados (estado en español) y conserva la alerta de duplicado', async () => {
      batch.execute.mockResolvedValue([
        ok('g_001'),
        ok('g_002', RuleStatus.PENDING, [
          {
            code: DUPLICATE_ALERT_CODE,
            message: 'Posible gasto duplicado de g_001: ...',
          },
        ]),
      ]);

      const csv = [header, row('g_001'), row('g_002')].join('\n');
      const res = await controller.reviewFile(fileFrom(csv));

      expect(res.resultados[0]).toEqual({
        gasto_id: 'g_001',
        status: 'APROBADO',
        alertas: [],
      });
      expect(res.resultados[1].gasto_id).toBe('g_002');
      expect(res.resultados[1].status).toBe('PENDIENTE');
      expect(res.resultados[1].alertas[0].codigo).toBe(DUPLICATE_ALERT_CODE);
      expect(res.resultados[1].alertas[0].mensaje).toContain('g_001');
      expect(res.errores).toEqual([]);
      expect(res.total).toBe(2);
      // Marca temporal ISO 8601 de la ejecución.
      expect(res.fecha_ejecucion).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('mapea outcomes de error a errores con su fila y gasto_id', async () => {
      batch.execute.mockResolvedValue([
        ok('g_001'),
        { kind: 'error', message: 'currency inválido: "XXX"' },
      ]);

      const csv = [header, row('g_001'), row('g_002', { moneda: 'XXX' })].join(
        '\n',
      );
      const res = await controller.reviewFile(fileFrom(csv));

      expect(res.resultados).toHaveLength(1);
      expect(res.errores).toHaveLength(1);
      expect(res.errores[0]).toMatchObject({ fila: 3, gasto_id: 'g_002' });
      expect(res.errores[0].error).toContain('currency');
    });

    it('aísla los errores de parseo (monto no numérico) antes del lote', async () => {
      batch.execute.mockResolvedValue([ok('g_001')]);

      const csv = [header, row('g_001'), row('g_bad', { monto: 'abc' })].join(
        '\n',
      );
      const res = await controller.reviewFile(fileFrom(csv));

      // El batch recibe solo el command válido; la fila inválida no llega.
      const [commandsArg] = batch.execute.mock.calls[0];
      expect(commandsArg).toHaveLength(1);
      expect(res.resultados).toHaveLength(1);
      expect(res.errores).toHaveLength(1);
      expect(res.errores[0]).toMatchObject({ fila: 3, gasto_id: 'g_bad' });
      expect(res.errores[0].error).toMatch(/monto/);
    });

    it('reporta tasas_api con el delta del lote y el total acumulado', async () => {
      batch.execute.mockImplementation(() => {
        counter.incrementApiCall();
        counter.incrementApiCall();
        counter.incrementCacheHit();
        return Promise.resolve([ok('g_001')]);
      });

      const csv = [header, row('g_001')].join('\n');
      const res = await controller.reviewFile(fileFrom(csv));

      expect(res.tasas_api).toEqual({
        lote: { llamadas_api: 2, cache_hits: 1 },
        total: { llamadas_api: 2, cache_hits: 1 },
      });
    });

    it('traduce la ausencia de política activa a 503 (afecta a todo el lote)', async () => {
      batch.execute.mockRejectedValue(new NoActivePolicyError());

      const csv = [header, row('g_001')].join('\n');
      await expect(controller.reviewFile(fileFrom(csv))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
