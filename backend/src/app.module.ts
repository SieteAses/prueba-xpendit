import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RulesEngineModule } from './rules_engine/rules-engine.module';

@Module({
  imports: [RulesEngineModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
