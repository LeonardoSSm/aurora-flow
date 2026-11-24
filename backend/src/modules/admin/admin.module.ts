import { Module } from '@nestjs/common';
import { AdminSeedController } from './admin-seed.controller';

@Module({
  controllers: [AdminSeedController],
})
export class AdminModule {}
