import { PolicyRepository } from '../../application/ports/policy-repository.port';
import { Policy } from '../../domain/entities/policy.entity';

/**
 * Marcador de posición del repositorio de políticas real (BD), pendiente para
 * fases siguientes. Sólo se cablea cuando `USE_STUB_DATA` es distinto de
 * `true`. Falla al usarse para señalar de forma explícita que la integración
 * definitiva aún no existe (en lugar de devolver datos silenciosamente).
 */
export class PendingPolicyRepository implements PolicyRepository {
  async findCurrent(): Promise<Policy | null> {
    throw new Error(
      'Repositorio de políticas real no implementado (pendiente para fases siguientes). ' +
        'Defina USE_STUB_DATA=true para usar los stubs de la Fase 1.',
    );
  }
}
