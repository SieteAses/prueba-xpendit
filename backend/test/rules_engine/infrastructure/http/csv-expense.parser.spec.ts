import {
  parseExpensesCsv,
  toReviewExpenseRequest,
} from '@/rules_engine/infrastructure/http/csv-expense.parser';

describe('csv-expense.parser', () => {
  const header =
    'gasto_id,empleado_id,empleado_nombre,empleado_apellido,empleado_cost_center,categoria,monto,moneda,fecha';

  describe('parseExpensesCsv', () => {
    it('parsea una fila usando las cabeceras como claves', () => {
      const csv = `${header}\ng_001,e_001,Eva,Luna,sales_team,food,81000,CLP,2026-05-13`;

      const rows = parseExpensesCsv(csv);

      expect(rows).toEqual([
        {
          gasto_id: 'g_001',
          empleado_id: 'e_001',
          empleado_nombre: 'Eva',
          empleado_apellido: 'Luna',
          empleado_cost_center: 'sales_team',
          categoria: 'food',
          monto: '81000',
          moneda: 'CLP',
          fecha: '2026-05-13',
        },
      ]);
    });

    it('ignora líneas vacías y recorta espacios', () => {
      const csv = `${header}\ng_001, e_001 ,Eva,Luna,sales_team,food,81000,CLP,2026-05-13\n\n`;

      const rows = parseExpensesCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].empleado_id).toBe('e_001');
    });

    it('respeta comas dentro de campos entrecomillados', () => {
      const csv = `${header}\ng_001,e_001,"Luna, Eva",Luna,sales_team,food,81000,CLP,2026-05-13`;

      const rows = parseExpensesCsv(csv);

      expect(rows[0].empleado_nombre).toBe('Luna, Eva');
    });
  });

  describe('toReviewExpenseRequest', () => {
    const validRow = {
      gasto_id: 'g_001',
      empleado_id: 'e_001',
      empleado_nombre: 'Eva',
      empleado_apellido: 'Luna',
      empleado_cost_center: 'sales_team',
      categoria: 'food',
      monto: '81000',
      moneda: 'CLP',
      fecha: '2026-05-13',
    };

    it('convierte el monto a número y conserva el resto de campos', () => {
      expect(toReviewExpenseRequest(validRow)).toEqual({
        gasto_id: 'g_001',
        empleado_id: 'e_001',
        empleado_nombre: 'Eva',
        empleado_apellido: 'Luna',
        empleado_cost_center: 'sales_team',
        categoria: 'food',
        monto: 81000,
        moneda: 'CLP',
        fecha: '2026-05-13',
      });
    });

    it('lanza error si el monto no es un número válido', () => {
      expect(() =>
        toReviewExpenseRequest({ ...validRow, monto: 'abc' }),
      ).toThrow(/monto/);
    });

    it('lanza error si falta el monto', () => {
      const sinMonto = { ...validRow, monto: undefined } as unknown as Record<
        string,
        string
      >;
      delete sinMonto.monto;
      expect(() => toReviewExpenseRequest(sinMonto)).toThrow(/monto/);
    });
  });
});
