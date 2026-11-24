import { Module } from '@nestjs/common';
import { SolicitationsModule } from '../solicitations/solicitations.module';
import { RealtimeListener } from './realtime.listener';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [SolicitationsModule],
  controllers: [],
  providers: [RealtimeService, RealtimeListener],
})
export class RealtimeModule {}
