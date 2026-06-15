import { Employee } from '@/rules_engine/domain/entities/employee.entity';
import { CostCenter } from '@/rules_engine/domain/enums/cost-center.enum';
import { Id } from '@/rules_engine/domain/value-objects/id.vo';

describe('Employee', () => {
  it('exposes first name, last name and cost center', () => {
    const employee = Employee.create(
      'Ada',
      'Lovelace',
      CostCenter.CORE_ENGINEERING,
    );

    expect(employee.getFirstName()).toBe('Ada');
    expect(employee.getLastName()).toBe('Lovelace');
    expect(employee.getCostCenter()).toBe(CostCenter.CORE_ENGINEERING);
  });

  it('generates an id when none is provided', () => {
    expect(
      Employee.create('Ada', 'Lovelace', CostCenter.FINANCE).getId(),
    ).toBeInstanceOf(Id);
  });

  it('throws when first name is empty', () => {
    expect(() => Employee.create('  ', 'Lovelace', CostCenter.FINANCE)).toThrow(
      'Employee firstName cannot be empty',
    );
  });

  it('throws when last name is empty', () => {
    expect(() => Employee.create('Ada', '  ', CostCenter.FINANCE)).toThrow(
      'Employee lastName cannot be empty',
    );
  });
});
