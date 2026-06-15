import { Id } from '@/rules_engine/domain/value-objects/id.vo';

describe('Id', () => {
  it('uses the provided value', () => {
    const id = Id.create('abc-123');

    expect(id.getValue()).toBe('abc-123');
  });

  it('generates a non-empty uuid when no value is provided', () => {
    const id = Id.create();

    expect(id.getValue()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates a different value on each call', () => {
    expect(Id.create().getValue()).not.toBe(Id.create().getValue());
  });
});
