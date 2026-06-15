import { BASE_CURRENCY } from '../../domain/constants/base-currency';
import { Employee } from '../../domain/entities/employee.entity';
import { Expense } from '../../domain/entities/expense.entity';
import { EvaluationContext } from '../../domain/services/evaluation-context';
import { Category } from '../../domain/enums/category.enum';
import { CostCenter } from '../../domain/enums/cost-center.enum';
import { Currency } from '../../domain/enums/currency.enum';
import { Id } from '../../domain/value-objects/id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { ReviewPolicyCommand } from '../dto/review-policy.command';
import { ReviewPolicyResult } from '../dto/review-policy.result';
import { NoActivePolicyError } from '../errors/no-active-policy.error';
import { ExchangeRatePort } from '../ports/exchange-rate.port';
import { PolicyRepository } from '../ports/policy-repository.port';

/** Convierte un string al valor de enum correspondiente o lanza un error. */
function parseEnum<T extends Record<string, string>>(
  e: T,
  value: string,
  label: string,
): T[keyof T] {
  const values = Object.values(e);
  if (!values.includes(value)) {
    throw new Error(
      `${label} inválido: "${value}". Valores permitidos: ${values.join(', ')}`,
    );
  }
  return value as T[keyof T];
}

/**
 * Caso de uso "revisor de políticas": evalúa un gasto contra la política activa.
 *
 * Recibe una fila de gasto (JSON), construye las entidades `Expense` y
 * `Employee` a partir de ella, normaliza el monto a la moneda base
 * ({@link BASE_CURRENCY}) y evalúa la `current_policy`. Si el gasto ya viene en
 * la moneda base, no se invoca el puerto de tasas de cambio.
 */
export class ReviewPolicyUseCase {
  constructor(
    private readonly policies: PolicyRepository,
    private readonly exchangeRate: ExchangeRatePort,
  ) {}

  async execute(command: ReviewPolicyCommand): Promise<ReviewPolicyResult> {
    const policy = await this.policies.findCurrent();
    if (!policy) {
      throw new NoActivePolicyError();
    }

    const currency = parseEnum(Currency, command.currency, 'currency');
    const category = parseEnum(Category, command.category, 'category');
    const costCenter = parseEnum(CostCenter, command.costCenter, 'costCenter');

    const expenseDate = new Date(command.date);
    let money = Money.create(command.amount, currency);
    if (currency !== BASE_CURRENCY) {
      money = await this.exchangeRate.convert(
        money,
        BASE_CURRENCY,
        expenseDate,
      );
    }

    const expense = Expense.create(
      money,
      expenseDate,
      category,
      Id.create(command.expenseId),
    );
    const employee = Employee.create(
      command.employeeFirstName,
      command.employeeLastName,
      costCenter,
      Id.create(command.employeeId),
    );

    const fields = EvaluationContext.build(expense, employee, new Date());
    const { status, alerts } = policy.evaluate(fields);

    return {
      expenseId: command.expenseId,
      status,
      alerts: alerts.map((alert) => ({
        code: alert.getCode(),
        message: alert.getMessage(),
      })),
    };
  }
}
