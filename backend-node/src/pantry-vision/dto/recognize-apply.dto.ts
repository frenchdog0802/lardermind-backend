import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_RECOGNIZED_ITEMS } from '../openai-vision.prompt';

export class RecognizedPantryItemDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class ApplyPantryVisionRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RECOGNIZED_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => RecognizedPantryItemDto)
  items!: RecognizedPantryItemDto[];
}
