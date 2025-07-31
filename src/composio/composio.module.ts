import { Module } from '@nestjs/common';
import { ComposioController } from './composio.controller';
import { ComposioService } from './composio.service';
import { AppConnectionDbService } from '../database/services/app-connection-db.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ComposioController],
  providers: [ComposioService, AppConnectionDbService],
  exports: [ComposioService, AppConnectionDbService],
})
export class ComposioModule {}
