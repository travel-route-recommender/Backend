import { Module } from '@nestjs/common';
import { MobilityController } from './mobility.controller';
import { MobilityService } from './mobility.service';

@Module({
  controllers: [MobilityController],
  providers: [MobilityService],
  exports: [MobilityService],
})
export class MobilityModule {}
