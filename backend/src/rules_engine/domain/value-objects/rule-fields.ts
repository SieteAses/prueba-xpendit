import { Category } from '../enums/category.enum';
import { CostCenter } from '../enums/cost-center.enum';
import { Money } from './money.vo';

/**
 * Catálogo de campos evaluables: única fuente de verdad de los datos sobre los
 * que operan las reglas. Es el contrato compartido entre el productor del
 * contexto (`EvaluationContext`) y los consumidores (`Rule`/`Policy`); ninguno
 * depende del otro, ambos dependen de este catálogo.
 *
 * Mezcla value objects (`Money`), enums (`Category`, `CostCenter`) y primitivos
 * (`Date`, `number`). `currency` está disponible vía `amount.getCurrency()`.
 */
export interface RuleFields {
  amount: Money;
  category: Category;
  costCenter: CostCenter;
  date: Date;
  /** Antigüedad del gasto en días, calculada al momento de evaluar la política. */
  ageInDays: number;
}

export type RuleField = keyof RuleFields;

/** El input se deriva del subconjunto de campos que la regla declara. */
export type RuleInput<K extends RuleField> = Pick<RuleFields, K>;
