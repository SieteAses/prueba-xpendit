/**
 * Puerto de reloj. Abstrae el acceso a "ahora" para que la capa de aplicación
 * no dependa directamente del reloj del sistema (`new Date()`), lo que la hace
 * pura y determinista en pruebas. La implementación vive en infraestructura.
 */
export interface Clock {
  /** Instante actual. */
  now(): Date;
}

/** Token de inyección de dependencias para el puerto `Clock`. */
export const CLOCK = Symbol('Clock');
