import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ok } from '../common/api-response';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApplyPantryVisionRequestDto } from './dto/recognize-apply.dto';
import { PantryVisionService } from './pantry-vision.service';

@Controller('api/pantry-vision')
export class PantryVisionController {
  constructor(private readonly pantryVisionService: PantryVisionService) {}

  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async recognize(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const result = await this.pantryVisionService.recognize(userId, file);
    return ok(result);
  }

  @Post('apply')
  async apply(
    @CurrentUser() userId: string,
    @Body() dto: ApplyPantryVisionRequestDto,
  ) {
    const result = await this.pantryVisionService.apply(userId, dto.items);
    return ok(result);
  }
}
