import { Employee } from '@/rules_engine/domain/entities/employee.entity';
import { Expense } from '@/rules_engine/domain/entities/expense.entity';
import { Category } from '@/rules_engine/domain/enums/category.enum';
import { CostCenter } from '@/rules_engine/domain/enums/cost-center.enum';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { RuleStatus } from '@/rules_engine/domain/enums/rule-status.enum';
import { EvaluationContext } from '@/rules_engine/domain/services/evaluation-context';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';
import {
  CURRENT_POLICY_ID,
  InMemoryPolicyRepository,
} from '@/rules_engine/infrastructure/persistence/in-memory-policy.repository';

describe('InMemoryPolicyRepository', () => {
  const repository = new InMemoryPolicyRepository();
  const TODAY = new Date('2026-06-15');

  it('devuelve la política activa sembrada', async () => {
    const policy = await repository.findCurrent();

    expect(policy).not.toBeNull();
    expect(policy!.getId().getValue()).toBe(CURRENT_POLICY_ID);
    expect(policy!.getRules().length).toBe(3);
  });

  // Evalúa un gasto (montos en USD) contra la política activa, con `TODAY` como
  // fecha de referencia para la antigüedad.
  const review = async (opts: {
    amount: number;
    category: Category;
    costCenter: CostCenter;
    date: string;
  }) => {
    const policy = await repository.findCurrent();
    const expense = Expense.create(
      Money.create(opts.amount, Currency.USD),
      new Date(opts.date),
      opts.category,
    );
    const employee = Employee.create('Test', 'User', opts.costCenter);
    return policy!.evaluate(EvaluationContext.build(expense, employee, TODAY));
  };

  describe('Regla de antigüedad', () => {
    // Se aíslan las otras reglas usando categoría != food y centro de costo != core_engineering.
    const base = {
      amount: 50,
      category: Category.SOFTWARE,
      costCenter: CostCenter.SALES_TEAM,
    };

    it('APROBADO cuando la antigüedad es ≤ 30 días, sin alertas', async () => {
      const result = await review({ ...base, date: '2026-06-01' }); // 14 días

      expect(result.status).toBe(RuleStatus.APPROVED);
      expect(result.alerts).toEqual([]);
    });

    it('PENDIENTE cuando la antigüedad está entre 31 y 60 días', async () => {
      const result = await review({ ...base, date: '2026-05-01' }); // 45 días

      expect(result.status).toBe(RuleStatus.PENDING);
      expect(result.alerts.map((a) => a.getCode())).toEqual([
        'LIMITE_ANTIGUEDAD',
      ]);
    });

    it('RECHAZADO cuando la antigüedad supera los 60 días', async () => {
      const result = await review({ ...base, date: '2026-01-01' }); // > 60 días

      expect(result.status).toBe(RuleStatus.REJECTED);
      expect(result.alerts.map((a) => a.getCode())).toEqual([
        'LIMITE_ANTIGUEDAD',
      ]);
    });
  });

  describe("Regla de límite 'food'", () => {
    // Gasto reciente (antigüedad APROBADA, sin alerta) y centro de costo que no dispara la regla cruzada.
    const base = {
      category: Category.FOOD,
      costCenter: CostCenter.SALES_TEAM,
      date: '2026-06-10',
    };

    it('APROBADO cuando el monto es ≤ 100 USD, sin alertas', async () => {
      const result = await review({ ...base, amount: 100 });

      expect(result.status).toBe(RuleStatus.APPROVED);
      expect(result.alerts).toEqual([]);
    });

    it('PENDIENTE cuando 100 < monto ≤ 150 USD', async () => {
      const result = await review({ ...base, amount: 120 });

      expect(result.status).toBe(RuleStatus.PENDING);
      expect(result.alerts.map((a) => a.getCode())).toEqual(['LIMITE_FOOD']);
      expect(result.alerts.map((a) => a.getMessage())).toEqual([
        'Requiere revisión',
      ]);
    });

    it('RECHAZADO cuando el monto supera 150 USD', async () => {
      const result = await review({ ...base, amount: 200 });

      expect(result.status).toBe(RuleStatus.REJECTED);
      expect(result.alerts.map((a) => a.getCode())).toEqual(['LIMITE_FOOD']);
      expect(result.alerts.map((a) => a.getMessage())).toEqual([
        'Excede límite aprobado',
      ]);
    });

    it("no aplica cuando la categoría no es 'food'", async () => {
      const result = await review({
        ...base,
        category: Category.SOFTWARE,
        amount: 5000,
      });

      // Sólo aplica la antigüedad (APROBADO), por lo que no hay alerta de monto.
      expect(result.status).toBe(RuleStatus.APPROVED);
      expect(result.alerts).toEqual([]);
    });
  });

  describe('Regla cruzada centro de costo / categoría', () => {
    it("RECHAZADO cuando core_engineering reporta 'food'", async () => {
      const result = await review({
        amount: 50,
        category: Category.FOOD,
        costCenter: CostCenter.CORE_ENGINEERING,
        date: '2026-06-10',
      });

      expect(result.status).toBe(RuleStatus.REJECTED);
      expect(result.alerts.map((a) => a.getCode())).toEqual([
        'POLITICA_CENTRO_COSTO',
      ]);
    });

    it('no aplica cuando el centro de costo no es core_engineering', async () => {
      const result = await review({
        amount: 50,
        category: Category.FOOD,
        costCenter: CostCenter.MARKETING,
        date: '2026-06-10',
      });

      expect(result.status).toBe(RuleStatus.APPROVED);
      expect(result.alerts).toEqual([]);
    });
  });

  describe('Valores frontera de antigüedad (referencia 2026-06-15)', () => {
    const base = {
      amount: 50,
      category: Category.SOFTWARE,
      costCenter: CostCenter.SALES_TEAM,
    };

    it('día 30 → APROBADO', async () => {
      const result = await review({ ...base, date: '2026-05-16' }); // exactamente 30 días
      expect(result.status).toBe(RuleStatus.APPROVED);
    });

    it('día 31 → PENDIENTE', async () => {
      const result = await review({ ...base, date: '2026-05-15' }); // exactamente 31 días
      expect(result.status).toBe(RuleStatus.PENDING);
    });

    it('día 60 → PENDIENTE', async () => {
      const result = await review({ ...base, date: '2026-04-16' }); // exactamente 60 días
      expect(result.status).toBe(RuleStatus.PENDING);
    });

    it('día 61 → RECHAZADO', async () => {
      const result = await review({ ...base, date: '2026-04-15' }); // exactamente 61 días
      expect(result.status).toBe(RuleStatus.REJECTED);
    });
  });

  describe("Valores frontera de límite 'food' (USD)", () => {
    // Gasto reciente (antigüedad APROBADA) y centro de costo que no dispara la regla cruzada.
    const base = {
      category: Category.FOOD,
      costCenter: CostCenter.SALES_TEAM,
      date: '2026-06-10',
    };

    it('monto = 100 → APROBADO', async () => {
      const result = await review({ ...base, amount: 100 });
      expect(result.status).toBe(RuleStatus.APPROVED);
    });

    it('monto = 100.01 → PENDIENTE', async () => {
      const result = await review({ ...base, amount: 100.01 });
      expect(result.status).toBe(RuleStatus.PENDING);
    });

    it('monto = 150 → PENDIENTE', async () => {
      const result = await review({ ...base, amount: 150 });
      expect(result.status).toBe(RuleStatus.PENDING);
    });

    it('monto = 150.01 → RECHAZADO', async () => {
      const result = await review({ ...base, amount: 150.01 });
      expect(result.status).toBe(RuleStatus.REJECTED);
    });
  });

  describe('Combinación de varias reglas', () => {
    it('acumula las alertas de cada regla que aplica, en orden de la política', async () => {
      // Antiguo (PENDIENTE) + food 120 (PENDIENTE) + core_engineering+food (RECHAZADO).
      const result = await review({
        amount: 120,
        category: Category.FOOD,
        costCenter: CostCenter.CORE_ENGINEERING,
        date: '2026-05-01', // 45 días
      });

      // Precedencia: el rechazo de la regla cruzada gana sobre los pendientes.
      expect(result.status).toBe(RuleStatus.REJECTED);
      // Orden = orden de las reglas en la política (antigüedad, food, cruzada).
      expect(result.alerts.map((a) => a.getCode())).toEqual([
        'LIMITE_ANTIGUEDAD',
        'LIMITE_FOOD',
        'POLITICA_CENTRO_COSTO',
      ]);
    });

    it('varias reglas en PENDIENTE, sin rechazo → PENDIENTE con sus alertas', async () => {
      // Antiguo (PENDIENTE) + food 120 (PENDIENTE), sin regla cruzada (sales_team).
      const result = await review({
        amount: 120,
        category: Category.FOOD,
        costCenter: CostCenter.SALES_TEAM,
        date: '2026-05-01', // 45 días
      });

      expect(result.status).toBe(RuleStatus.PENDING);
      expect(result.alerts.map((a) => a.getCode())).toEqual([
        'LIMITE_ANTIGUEDAD',
        'LIMITE_FOOD',
      ]);
    });
  });
});
