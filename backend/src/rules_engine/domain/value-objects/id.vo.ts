import { randomUUID } from 'crypto';

export class Id {
  private constructor(private readonly value: string) {}

  public static create(value?: string): Id {
    return new Id(value ?? randomUUID());
  }

  getValue(): string {
    return this.value;
  }
}
