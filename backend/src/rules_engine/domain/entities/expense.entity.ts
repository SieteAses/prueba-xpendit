import { Category } from '../enums/category.enum';
import { Id } from '../value-objects/id.vo';
import { Money } from '../value-objects/money.vo';
import { RuleFields } from '../value-objects/rule-fields';

export class Expense {
  private constructor(
    private readonly id: Id,
    private readonly money: Money,
    private readonly date: Date,
    private readonly category: Category,
  ) {}

  static create(
    money: Money,
    date: Date,
    category: Category,
    id?: Id,
  ): Expense {
    return new Expense(id ?? Id.create(), money, date, category);
  }

  getId(): Id {
    return this.id;
  }

  getMoney(): Money {
    return this.money;
  }

  getDate(): Date {
    return this.date;
  }

  getCategory(): Category {
    return this.category;
  }

  /** Antigüedad del gasto en días completos respecto a `reference` (p. ej. hoy). */
  ageInDaysAt(reference: Date): number {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    return Math.floor((reference.getTime() - this.date.getTime()) / MS_PER_DAY);
  }

  /** Porción del catálogo de reglas que aporta el gasto. */
  toRuleFields(): Pick<RuleFields, 'amount' | 'category' | 'date'> {
    return {
      amount: this.money,
      category: this.category,
      date: this.date,
    };
  }
}
