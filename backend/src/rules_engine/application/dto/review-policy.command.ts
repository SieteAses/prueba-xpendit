/**
 * Comando de entrada del caso de uso `ReviewPolicy`. Representa un gasto
 * recibido en forma de JSON con primitivos. El caso de uso valida los campos y
 * construye, en tiempo de ejecución, las entidades `Expense` y `Employee` a
 * partir de ellos (no se persisten).
 */
export interface ReviewPolicyCommand {
  expenseId: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  /** Centro de costo del empleado (valor del enum `CostCenter`). */
  costCenter: string;
  /** Categoría del gasto (valor del enum `Category`). */
  category: string;
  /** Monto del gasto, en la moneda indicada por `currency`. */
  amount: number;
  /** Código ISO de la moneda del gasto (p. ej. "USD", "CLP", "EUR"). */
  currency: string;
  /** Fecha del gasto en formato ISO 8601 (p. ej. "2026-06-15"). */
  date: string;
}
