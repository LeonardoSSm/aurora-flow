import { Module } from '@nestjs/common';
import { LabelValidatorClientService } from './label-validator-client.service';

@Module({
  providers: [LabelValidatorClientService],
  exports: [LabelValidatorClientService],
})
export class LabelValidatorModule {}
