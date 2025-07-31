import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PgVectorService } from './pgvector.service';

@Module({
  imports: [ConfigModule],
  providers: [PgVectorService],
  exports: [PgVectorService],
})
export class PgVectorModule {}
