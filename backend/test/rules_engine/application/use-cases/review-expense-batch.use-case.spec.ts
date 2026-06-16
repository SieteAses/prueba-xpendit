import { ReviewPolicyCommand } from '@/rules_engine/application/dto/review-policy.command';
import { ReviewPolicyResult } from '@/rules_engine/application/dto/review-policy.result';
import { NoActivePolicyError } from '@/rules_engine/application/errors/no-active-policy.error';
import { ReviewPolicyUseCase } from '@/rules_engine/application/use-cases/review-policy.use-case';
import {
  DUPLICATE_ALERT_CODE,
  ReviewExpenseBatchUseCase,
} from '@/rules_engine/application/use-cases/review-expense-batch.use-case';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';

describe('ReviewExpenseBatchUseCase', () => {
  let reviewPolicy: { execute: jest.Mock };
  let useCase: ReviewExpenseBatchUseCase;

  beforeEach(() => {
    reviewPolicy = { execute: jest.fn() };
    useCase = new ReviewExpenseBatchUseCase(
      reviewPolicy as unknown as ReviewPolicyUseCase,
    );
  });

  const command = (
    expenseId: string,
    overrides: Partial<ReviewPolicyCommand> = {},
  ): ReviewPolicyCommand => ({
    expenseId,
    employeeId: 'e_001',
    employeeFirstName: 'Eva',
    employeeLastName: 'Luna',
    costCenter: 'sales_team',
    category: 'food',
    amount: 100,
    currency: 'USD',
    date: '2026-05-13',
    ...overrides,
  });

  const approved = (expenseId: string): ReviewPolicyResult => ({
    expenseId,
    status: RuleStatus.APPROVED,
    alerts: [],
  });

  it('no añade alerta de duplicado al primer gasto del grupo', async () => {
    reviewPolicy.execute.mockResolvedValueOnce(approved('g_001'));

    const [outcome] = await useCase.execute([command('g_001')]);

    expect(outcome).toEqual({ kind: 'ok', result: approved('g_001') });
  });

  it('marca la copia con alerta GASTO_DUPLICADO citando el id del original y eleva a PENDING', async () => {
    reviewPolicy.execute
      .mockResolvedValueOnce(approved('g_001'))
      .mockResolvedValueOnce(approved('g_002'));

    const outcomes = await useCase.execute([
      command('g_001'),
      command('g_002'),
    ]);

    expect(outcomes[0]).toEqual({ kind: 'ok', result: approved('g_001') });
    const second = outcomes[1];
    expect(second.kind).toBe('ok');
    if (second.kind !== 'ok') return;
    expect(second.result.expenseId).toBe('g_002');
    expect(second.result.status).toBe(RuleStatus.PENDING);
    expect(second.result.alerts).toHaveLength(1);
    expect(second.result.alerts[0].code).toBe(DUPLICATE_ALERT_CODE);
    expect(second.result.alerts[0].message).toContain('g_001');
  });

  it('conserva REJECTED en una copia ya rechazada por la política', async () => {
    reviewPolicy.execute
      .mockResolvedValueOnce(approved('g_001'))
      .mockResolvedValueOnce({
        expenseId: 'g_002',
        status: RuleStatus.REJECTED,
        alerts: [{ code: 'LIMITE_FOOD', message: 'Excede límite aprobado' }],
      });

    const outcomes = await useCase.execute([
      command('g_001'),
      command('g_002'),
    ]);

    const result = (outcomes[1] as { kind: 'ok'; result: ReviewPolicyResult })
      .result;
    expect(result.status).toBe(RuleStatus.REJECTED);
    expect(result.alerts[0]).toEqual({
      code: 'LIMITE_FOOD',
      message: 'Excede límite aprobado',
    });
    expect(result.alerts[1].code).toBe(DUPLICATE_ALERT_CODE);
    expect(result.alerts[1].message).toContain('g_001');
  });

  it('aísla el error de una fila sin abortar el lote', async () => {
    reviewPolicy.execute
      .mockResolvedValueOnce(approved('g_001'))
      .mockRejectedValueOnce(new Error('currency inválido: "XXX"'))
      .mockResolvedValueOnce(approved('g_003'));

    const outcomes = await useCase.execute([
      command('g_001'),
      command('g_002', { currency: 'XXX' }),
      command('g_003'),
    ]);

    expect(outcomes[0].kind).toBe('ok');
    const second = outcomes[1];
    expect(second.kind).toBe('error');
    if (second.kind !== 'error') return;
    expect(second.message).toContain('currency');
    expect(outcomes[2].kind).toBe('ok');
  });

  it('re-lanza NoActivePolicyError (aborta todo el lote)', async () => {
    reviewPolicy.execute.mockRejectedValue(new NoActivePolicyError());

    await expect(useCase.execute([command('g_001')])).rejects.toBeInstanceOf(
      NoActivePolicyError,
    );
  });
});
