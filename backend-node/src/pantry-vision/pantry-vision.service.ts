import { Injectable } from '@nestjs/common';
import { BadRequestError } from '../common/errors/http-errors';
import { PantryItemsService } from '../pantry-items/pantry-items.service';
import type { PantryItemDto } from '../pantry-items/dto/pantry-item.dto';
import { UsageQuotaService } from '../usage-quota/usage-quota.service';
import type { RecognizedPantryItemDto } from './dto/recognize-apply.dto';
import { OpenAiVisionClient } from './openai-vision.client';
import type { RecognizedPantryItem } from './openai-vision.prompt';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class PantryVisionService {
  constructor(
    private readonly usageQuotaService: UsageQuotaService,
    private readonly openAiVisionClient: OpenAiVisionClient,
    private readonly pantryItemsService: PantryItemsService,
  ) {}

  async recognize(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ items: RecognizedPantryItem[]; message: string | null }> {
    this.assertValidImage(file);
    await this.usageQuotaService.checkAndIncrementImageUpload(userId);

    const mime = file!.mimetype || 'image/jpeg';
    const items = await this.openAiVisionClient.recognizeImage(
      file!.buffer,
      mime,
    );

    return {
      items,
      message: items.length === 0 ? 'No food items recognized.' : null,
    };
  }

  async apply(
    userId: string,
    items: RecognizedPantryItemDto[],
  ): Promise<{
    items: PantryItemDto[];
    added: number;
    merged: number;
  }> {
    const cleaned = items
      .map((item) => ({
        name: String(item.name ?? '').trim(),
        quantity: Number(item.quantity),
        unit: item.unit?.trim() || undefined,
      }))
      .filter((item) => item.name.length > 0);

    if (cleaned.length === 0) {
      throw new BadRequestError('At least one item with a name is required');
    }

    const results: PantryItemDto[] = [];
    let added = 0;
    let merged = 0;

    for (const row of cleaned) {
      const quantity = Number.isFinite(row.quantity)
        ? Math.max(0, row.quantity)
        : 0;
      const result = await this.pantryItemsService.mergeAddItem(userId, {
        name: row.name,
        quantity,
        unit: row.unit,
      });
      results.push(result.item);
      if (result.merged) {
        merged += 1;
      } else {
        added += 1;
      }
    }

    return { items: results, added, merged };
  }

  private assertValidImage(file: Express.Multer.File | undefined): void {
    if (!file?.buffer?.length) {
      throw new BadRequestError('image file is required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestError('image exceeds 8MB limit');
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestError('unsupported image type');
    }
  }
}
