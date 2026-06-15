import { Module } from '@nestjs/common';
import {
  ExchangeRatePort,
  EXCHANGE_RATE_PORT,
} from './application/ports/exchange-rate.port';
import {
  PolicyRepository,
  POLICY_REPOSITORY,
} from './application/ports/policy-repository.port';
import { ReviewPolicyUseCase } from './application/use-cases/review-policy.use-case';
import { useStubData } from './infrastructure/config/use-stub-data';
import { PendingExchangeRateProvider } from './infrastructure/exchange-rate/pending-exchange-rate.provider';
import { StubExchangeRateProvider } from './infrastructure/exchange-rate/stub-exchange-rate.provider';
import { ReviewPolicyController } from './infrastructure/http/review-policy.controller';
import { InMemoryPolicyRepository } from './infrastructure/persistence/in-memory-policy.repository';
import { PendingPolicyRepository } from './infrastructure/persistence/pending-policy.repository';

/**
 * Módulo del motor de reglas. Cablea el caso de uso de aplicación con las
 * implementaciones de infraestructura. El flag de entorno `USE_STUB_DATA`
 * decide entre los stubs de la Fase 1 (datos en memoria, tasas fijas) y las
 * implementaciones reales —pendientes para fases siguientes—. En ambos casos
 * la capa de aplicación y el dominio quedan intactos: cambiar de stub a real
 * es sólo cambiar el provider detrás del puerto.
 */
@Module({
  controllers: [ReviewPolicyController],
  providers: [
    {
      provide: POLICY_REPOSITORY,
      useClass: useStubData()
        ? InMemoryPolicyRepository
        : PendingPolicyRepository,
    },
    {
      provide: EXCHANGE_RATE_PORT,
      useClass: useStubData()
        ? StubExchangeRateProvider
        : PendingExchangeRateProvider,
    },
    {
      provide: ReviewPolicyUseCase,
      useFactory: (
        policies: PolicyRepository,
        exchangeRate: ExchangeRatePort,
      ) => new ReviewPolicyUseCase(policies, exchangeRate),
      inject: [POLICY_REPOSITORY, EXCHANGE_RATE_PORT],
    },
  ],
  exports: [ReviewPolicyUseCase],
})
export class RulesEngineModule {}
