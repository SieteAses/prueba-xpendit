/** Se lanza cuando no hay una política activa (`current_policy`) configurada. */
export class NoActivePolicyError extends Error {
  constructor() {
    super('No hay una política activa configurada');
    this.name = 'NoActivePolicyError';
  }
}
