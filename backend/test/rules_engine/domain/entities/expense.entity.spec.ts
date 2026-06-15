import { Expense } from '@/rules_engine/domain/entities/expense.entity';
import { Category } from '@/rules_engine/domain/enums/category.enum';
import { Currency } from '@/rules_engine/domain/enums/currency.enum';
import { Id } from '@/rules_engine/domain/value-objects/id.vo';
import { Money } from '@/rules_engine/domain/value-objects/money.vo';

describe('Expense', () => {
  const money = Money.create(100, Currency.USD);
  const date = new Date('2026-06-14');

  it('exposes money, date and category', () => {
    const expense = Expense.create(money, date, Category.SOFTWARE);

    expect(expense.getMoney()).toBe(money);
    expect(expense.getDate()).toBe(date);
    expect(expense.getCategory()).toBe(Category.SOFTWARE);
  });

  it('generates an id when none is provided', () => {
    expect(Expense.create(money, date, Category.FOOD).getId()).toBeInstanceOf(
      Id,
    );
  });

  it('uses the provided id', () => {
    const id = Id.create('expense-1');

    expect(Expense.create(money, date, Category.FOOD, id).getId()).toBe(id);
  });
});
