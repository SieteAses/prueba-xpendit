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
import { openExchangeRatesConfig } from './infrastructure/config/open-exchange-rates.config';
import { useStubData } from './infrastructure/config/use-stub-data';
import { OpenExchangeRateProvider } from './infrastructure/exchange-rate/open-exchange-rate.provider';
import { StubExchangeRateProvider } from './infrastructure/exchange-rate/stub-exchange-rate.provider';
import { ReviewPolicyController } from './infrastructure/http/review-policy.controller';
import { InMemoryPolicyRepository } from './infrastructure/persistence/in-memory-policy.repository';

/**
 * Módulo del motor de reglas. Cablea el caso de uso de aplicación con las
 * implementaciones de infraestructura. Las políticas viven siempre en memoria
 * (este proyecto no se conecta a una BD). El flag de entorno `USE_STUB_DATA`
 * decide únicamente el provider de tasas de cambio: stub con tasas fijas
 * (desarrollo offline) o la integración real con Open Exchange Rates. En ambos
 * casos la capa de aplicación y el dominio quedan intactos: cambiar de stub a
 * real es sólo cambiar el provider detrás del puerto.
 */
@Module({
  controllers: [ReviewPolicyController],
  providers: [
    {
      provide: POLICY_REPOSITORY,
      useClass: InMemoryPolicyRepository,
    },
    {
      provide: EXCHANGE_RATE_PORT,
      useFactory: (): ExchangeRatePort => {
        if (useStubData()) {
          return new StubExchangeRateProvider();
        }
        const { appId, baseUrl } = openExchangeRatesConfig();
        return new OpenExchangeRateProvider(appId, baseUrl);
      },
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
