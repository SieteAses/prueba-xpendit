import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReviewPolicyResult } from '@/rules_engine/application/dto/review-policy.result';
import { NoActivePolicyError } from '@/rules_engine/application/errors/no-active-policy.error';
import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { ReviewExpenseRequest } from '@/rules_engine/infrastructure/http/dto/review-expense.request';
import { ReviewPolicyController } from '@/rules_engine/infrastructure/http/review-policy.controller';

describe('ReviewPolicyController', () => {
  let useCase: { execute: jest.Mock };
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
    controller = new ReviewPolicyController(
      useCase as unknown as ReviewPolicyUseCase,
    );
  });

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

  it('traduce el resultado interno a la respuesta externa (estado en español, nombres del CSV)', async () => {
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

  it('devuelve alertas vacías cuando no hay alertas', async () => {
    useCase.execute.mockResolvedValue({
      expenseId: 'g_004',
      status: RuleStatus.APPROVED,
      alerts: [],
    });

    const response = await controller.review(request);

    expect(response).toEqual({
      gasto_id: 'g_004',
      status: 'APROBADO',
      alertas: [],
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
