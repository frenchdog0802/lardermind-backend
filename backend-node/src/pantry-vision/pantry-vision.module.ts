import { Module } from '@nestjs/common';
import { PantryItemsModule } from '../pantry-items/pantry-items.module';
import { UsageQuotaModule } from '../usage-quota/usage-quota.module';
import { OpenAiVisionClient } from './openai-vision.client';
import { PantryVisionController } from './pantry-vision.controller';
import { PantryVisionService } from './pantry-vision.service';

@Module({
  imports: [UsageQuotaModule, PantryItemsModule],
  controllers: [PantryVisionController],
  providers: [PantryVisionService, OpenAiVisionClient],
})
export class PantryVisionModule {}
