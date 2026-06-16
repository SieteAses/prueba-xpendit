import { Module } from '@nestjs/common';
import { Clock, CLOCK } from './application/ports/clock.port';
import {
  ExchangeRatePort,
  EXCHANGE_RATE_PORT,
} from './application/ports/exchange-rate.port';
import {
  PolicyRepository,
  POLICY_REPOSITORY,
} from './application/ports/policy-repository.port';
import { ReviewExpenseBatchUseCase } from './application/use-cases/review-expense-batch.use-case';
import { ReviewPolicyUseCase } from './application/use-cases/review-policy.use-case';
import { SystemClock } from './infrastructure/clock/system-clock';
import { openExchangeRatesConfig } from './infrastructure/config/open-exchange-rates.config';
import { useStubData } from './infrastructure/config/use-stub-data';
import { ExchangeRateCallCounter } from './infrastructure/exchange-rate/exchange-rate-call-counter';
import {
  fetchHistoricalRatesClient,
  OpenExchangeRateProvider,
} from './infrastructure/exchange-rate/open-exchange-rate.provider';
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
    ExchangeRateCallCounter,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
    {
      provide: EXCHANGE_RATE_PORT,
      useFactory: (counter: ExchangeRateCallCounter): ExchangeRatePort => {
        if (useStubData()) {
          return new StubExchangeRateProvider();
        }
        const { appId, baseUrl } = openExchangeRatesConfig();
        return new OpenExchangeRateProvider(
          appId,
          baseUrl,
          fetchHistoricalRatesClient,
          counter,
        );
      },
      inject: [ExchangeRateCallCounter],
    },
    {
      provide: ReviewPolicyUseCase,
      useFactory: (
        policies: PolicyRepository,
        exchangeRate: ExchangeRatePort,
        clock: Clock,
      ) => new ReviewPolicyUseCase(policies, exchangeRate, clock),
      inject: [POLICY_REPOSITORY, EXCHANGE_RATE_PORT, CLOCK],
    },
    {
      provide: ReviewExpenseBatchUseCase,
      useFactory: (reviewPolicy: ReviewPolicyUseCase) =>
        new ReviewExpenseBatchUseCase(reviewPolicy),
      inject: [ReviewPolicyUseCase],
    },
  ],
  exports: [ReviewPolicyUseCase, ReviewExpenseBatchUseCase],
})
export class RulesEngineModule {}
