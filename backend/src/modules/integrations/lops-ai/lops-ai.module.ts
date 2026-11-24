import { Module } from '@nestjs/common';
import { LopsAiController } from './lops-ai.controller';
import { LopsAiService } from './lops-ai.service';

@Module({
  controllers: [LopsAiController],
  providers: [LopsAiService],
  exports: [LopsAiService],
})
export class LopsAiModule {}
