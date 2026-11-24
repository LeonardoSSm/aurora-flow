import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormConnectorEntity, FormVersionEntity, SubmissionEntity } from '../../database/entities';
import { ConnectorsListener } from './connectors.listener';
import { ConnectorsService } from './connectors.service';

@Module({
  imports: [TypeOrmModule.forFeature([FormConnectorEntity, SubmissionEntity, FormVersionEntity])],
  controllers: [],
  providers: [ConnectorsService, ConnectorsListener],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
