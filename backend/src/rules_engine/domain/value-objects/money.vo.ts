import { Currency } from '../enums/currency.enum';

export class Money {
  private constructor(
    private readonly amount: number,
    private readonly currency: Currency,
  ) {}

  static create(amount: number, currency: Currency): Money {
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    return new Money(amount, currency);
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): Currency {
    return this.currency;
  }
}
