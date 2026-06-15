import { Policy } from '../../domain/entities/policy.entity';

/**
 * Puerto de persistencia de políticas. La implementación vive en la capa de
 * infraestructura (por ahora un stub en memoria; en fases siguientes, una BD
 * real).
 */
export interface PolicyRepository {
  /**
   * Devuelve la política activa (la `current_policy`) con sus reglas, o `null`
   * si no hay ninguna configurada.
   */
  findCurrent(): Promise<Policy | null>;
}

/** Token de inyección de dependencias para el puerto `PolicyRepository`. */
export const POLICY_REPOSITORY = Symbol('PolicyRepository');
