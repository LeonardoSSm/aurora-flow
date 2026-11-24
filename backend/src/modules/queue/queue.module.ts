import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { RabbitMqService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class QueueModule {}
