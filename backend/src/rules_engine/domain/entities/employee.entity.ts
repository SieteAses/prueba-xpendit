import { CostCenter } from '../enums/cost-center.enum';
import { Id } from '../value-objects/id.vo';
import { RuleFields } from '../value-objects/rule-fields';

export class Employee {
  private constructor(
    private readonly id: Id,
    private readonly firstName: string,
    private readonly lastName: string,
    private readonly costCenter: CostCenter,
  ) {}

  static create(
    firstName: string,
    lastName: string,
    costCenter: CostCenter,
    id?: Id,
  ): Employee {
    if (!firstName.trim()) {
      throw new Error('Employee firstName cannot be empty');
    }
    if (!lastName.trim()) {
      throw new Error('Employee lastName cannot be empty');
    }
    return new Employee(id ?? Id.create(), firstName, lastName, costCenter);
  }

  getId(): Id {
    return this.id;
  }

  getFirstName(): string {
    return this.firstName;
  }

  getLastName(): string {
    return this.lastName;
  }

  getCostCenter(): CostCenter {
    return this.costCenter;
  }

  /** Porción del catálogo de reglas que aporta el empleado. */
  toRuleFields(): Pick<RuleFields, 'costCenter'> {
    return {
      costCenter: this.costCenter,
    };
  }
}
