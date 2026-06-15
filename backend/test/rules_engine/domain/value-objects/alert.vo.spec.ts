import { Alert } from '@/rules_engine/domain/value-objects/alert.vo';

describe('Alert', () => {
  it('creates an alert with code and message', () => {
    const alert = Alert.create(
      'AMOUNT_TOO_HIGH',
      'El monto supera el límite permitido',
    );

    expect(alert.getCode()).toBe('AMOUNT_TOO_HIGH');
    expect(alert.getMessage()).toBe('El monto supera el límite permitido');
  });

  it('throws when code is empty', () => {
    expect(() => Alert.create('  ', 'mensaje')).toThrow(
      'Alert code cannot be empty',
    );
  });

  it('throws when message is empty', () => {
    expect(() => Alert.create('CODE', '  ')).toThrow(
      'Alert message cannot be empty',
    );
  });
});
