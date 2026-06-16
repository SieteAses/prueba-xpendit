import { detectDuplicateCopies } from '@/rules_engine/domain/services/exact-duplicate-detector';

describe('detectDuplicateCopies', () => {
  const item = (
    id: string,
    amount: number,
    currency: string,
    date: string,
  ) => ({ id, amount, currency, date });

  it('devuelve lista vacía para entrada vacía', () => {
    expect(detectDuplicateCopies([])).toEqual([]);
  });

  it('no marca un único gasto', () => {
    expect(
      detectDuplicateCopies([item('g_001', 100, 'USD', '2026-05-13')]),
    ).toEqual([null]);
  });

  it('marca la copia con el id de la primera ocurrencia; la primera queda en null', () => {
    const result = detectDuplicateCopies([
      item('g_001', 100, 'USD', '2026-05-13'),
      item('g_002', 100, 'USD', '2026-05-13'),
    ]);

    expect(result).toEqual([null, 'g_001']);
  });

  it('marca todas las copias 2.ª+ apuntando siempre al primer original', () => {
    const result = detectDuplicateCopies([
      item('g_001', 100, 'USD', '2026-05-13'),
      item('g_002', 100, 'USD', '2026-05-13'),
      item('g_003', 100, 'USD', '2026-05-13'),
    ]);

    expect(result).toEqual([null, 'g_001', 'g_001']);
  });

  it('no considera duplicado si difiere el monto, la moneda o la fecha', () => {
    const result = detectDuplicateCopies([
      item('g_001', 100, 'USD', '2026-05-13'),
      item('g_002', 200, 'USD', '2026-05-13'), // distinto monto
      item('g_003', 100, 'EUR', '2026-05-13'), // distinta moneda
      item('g_004', 100, 'USD', '2026-05-14'), // distinta fecha
    ]);

    expect(result).toEqual([null, null, null, null]);
  });

  it('maneja varios grupos intercalados preservando el orden', () => {
    const result = detectDuplicateCopies([
      item('g_001', 100, 'USD', '2026-05-13'), // grupo A original
      item('g_002', 50, 'EUR', '2026-05-13'), // grupo B original
      item('g_003', 100, 'USD', '2026-05-13'), // copia de A
      item('g_004', 50, 'EUR', '2026-05-13'), // copia de B
    ]);

    expect(result).toEqual([null, null, 'g_001', 'g_002']);
  });
});
