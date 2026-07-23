import { Module } from '@nestjs/common';
import { MasterDataService } from './application/master-data.service';
import { MASTER_DATA_REPOSITORY } from './domain/master-data.repository';
import { OracleMasterDataRepository } from './infrastructure/oracle-master-data.repository';
import { MasterDataController } from './master-data.controller';

@Module({
  controllers: [MasterDataController],
  providers: [
    MasterDataService,
    OracleMasterDataRepository,
    { provide: MASTER_DATA_REPOSITORY, useExisting: OracleMasterDataRepository },
  ],
  exports: [MasterDataService],
})
export class MasterDataModule {}
