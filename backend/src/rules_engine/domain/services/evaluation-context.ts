import { Employee } from '../entities/employee.entity';
import { Expense } from '../entities/expense.entity';
import { RuleFields } from '../value-objects/rule-fields';

/**
 * Contexto de evaluación: arma el catálogo de campos evaluables (`RuleFields`)
 * a partir de las entidades de dominio y el momento de evaluación.
 *
 * Aquí vive la derivación de campos (p. ej. `ageInDays`, que depende de la
 * fecha de evaluación). `Policy` solo consume el `RuleFields` ya armado, por lo
 * que es agnóstica tanto al tipo de regla como a cómo se obtiene cada campo.
 * Para añadir un nuevo campo evaluable derivado, basta con declararlo en
 * `RuleFields` y calcularlo aquí; ni `Policy` ni `Rule` cambian.
 */
export const EvaluationContext = {
  build(expense: Expense, employee: Employee, evaluatedAt: Date): RuleFields {
    return {
      ...expense.toRuleFields(),
      ...employee.toRuleFields(),
      ageInDays: expense.ageInDaysAt(evaluatedAt),
    };
  },
};
