import { Injectable } from '@nestjs/common';
import type { Ingredient, PantryItem } from '@prisma/client';
import { NotFoundError } from '../common/errors/http-errors';
import { bigintToNumber } from '../common/mappers/user.mapper';
import { nowUnixSeconds } from '../common/time';
import {
  resolveBaseUnit,
  resolveDisplayUnit,
  resolveKind,
  convert,
  kindOf,
  normalize,
} from '../common/unit/unit-converter';
import { unitKindToApiValue } from '../common/unit/unit-kind';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkPantryItemsRequestDto,
  CreatePantryItemRequestDto,
  UpdatePantryItemRequestDto,
  type PantryItemDto,
} from './dto/pantry-item.dto';

type PantryItemWithIngredient = PantryItem & { ingredient: Ingredient };

@Injectable()
export class PantryItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(userId: string): Promise<PantryItemDto[]> {
    const items = await this.prisma.pantryItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { ingredient: true },
    });
    return items.map((item) => this.toDto(item));
  }

  async getItem(userId: string, id: string): Promise<PantryItemDto> {
    const item = await this.prisma.pantryItem.findFirst({
      where: { id, userId },
      include: { ingredient: true },
    });
    if (!item) {
      throw new NotFoundError('Pantry item not found');
    }
    return this.toDto(item);
  }

  async createItem(
    userId: string,
    dto: CreatePantryItemRequestDto,
  ): Promise<PantryItemDto> {
    const resolved = this.resolveCreateFields(dto);
    const ingredient = await this.resolveIngredient(resolved);
    const now = BigInt(nowUnixSeconds());

    const item = await this.prisma.pantryItem.create({
      data: {
        userId,
        ingredientId: ingredient.id,
        quantity: resolved.quantity,
        unit: resolved.unit ?? ingredient.baseUnit ?? ingredient.defaultUnit ?? null,
        notes: resolved.notes ?? null,
        createdAt: now,
        updatedAt: now,
      },
      include: { ingredient: true },
    });
    return this.toDto(item);
  }

  async bulkCreateItems(
    userId: string,
    dto: BulkPantryItemsRequestDto,
  ): Promise<PantryItemDto[]> {
    const results: PantryItemDto[] = [];
    for (const item of dto.items) {
      results.push(await this.createItem(userId, item));
    }
    return results;
  }

  async bulkUpdateItems(
    userId: string,
    dto: BulkPantryItemsRequestDto,
  ): Promise<PantryItemDto[]> {
    const results: PantryItemDto[] = [];
    for (const item of dto.items) {
      const resolved = this.resolveCreateFields(item);
      const ingredient = await this.resolveIngredient(resolved);
      const existing = await this.prisma.pantryItem.findFirst({
        where: { userId, ingredientId: ingredient.id },
        include: { ingredient: true },
      });
      if (existing) {
        results.push(
          await this.updateItem(userId, existing.id, {
            quantity: resolved.quantity,
            unit: resolved.unit,
            notes: resolved.notes,
          }),
        );
      } else {
        results.push(await this.createItem(userId, item));
      }
    }
    return results;
  }

  async updateItem(
    userId: string,
    id: string,
    dto: UpdatePantryItemRequestDto,
  ): Promise<PantryItemDto> {
    const existing = await this.prisma.pantryItem.findFirst({
      where: { id, userId },
      include: { ingredient: true },
    });
    if (!existing) {
      throw new NotFoundError('Pantry item not found');
    }

    const details = dto.details ?? {};
    const quantity = dto.quantity ?? details.quantity ?? existing.quantity;
    const unit = dto.unit ?? details.unit ?? existing.unit;
    const notes = dto.notes ?? details.notes ?? existing.notes;

    const item = await this.prisma.pantryItem.update({
      where: { id },
      data: {
        quantity,
        unit,
        notes,
        updatedAt: BigInt(nowUnixSeconds()),
      },
      include: { ingredient: true },
    });
    return this.toDto(item);
  }

  async deleteItem(userId: string, id: string): Promise<{ message: string }> {
    const existing = await this.prisma.pantryItem.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundError('Pantry item not found');
    }

    await this.prisma.pantryItem.delete({ where: { id } });
    return { message: 'Pantry item deleted' };
  }

  /**
   * Create or add quantity for an ingredient by name.
   * Same unit-kind: convert into existing unit then add.
   * Otherwise: raw numeric add (chat-tool parity fallback).
   */
  async mergeAddItem(
    userId: string,
    input: {
      name: string;
      quantity: number;
      unit?: string;
      notes?: string;
    },
  ): Promise<{ item: PantryItemDto; merged: boolean }> {
    const name = input.name?.trim();
    if (!name) {
      throw new NotFoundError('Ingredient not found');
    }

    const quantity = Number.isFinite(input.quantity)
      ? Number(input.quantity)
      : 0;
    const ingredient = await this.resolveIngredient({ name });
    const existing = await this.prisma.pantryItem.findFirst({
      where: { userId, ingredientId: ingredient.id },
      include: { ingredient: true },
    });

    const incomingUnit =
      input.unit?.trim() ||
      ingredient.baseUnit ||
      ingredient.defaultUnit ||
      null;

    if (!existing) {
      const now = BigInt(nowUnixSeconds());
      const created = await this.prisma.pantryItem.create({
        data: {
          userId,
          ingredientId: ingredient.id,
          quantity,
          unit: incomingUnit,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
        include: { ingredient: true },
      });
      return { item: this.toDto(created), merged: false };
    }

    const addQty = this.resolveMergeQuantity(
      quantity,
      incomingUnit,
      existing.quantity,
      existing.unit,
    );
    const nextUnit =
      existing.unit && existing.unit.trim().length > 0
        ? existing.unit
        : incomingUnit;

    const updated = await this.prisma.pantryItem.update({
      where: { id: existing.id },
      data: {
        quantity: addQty,
        unit: nextUnit,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedAt: BigInt(nowUnixSeconds()),
      },
      include: { ingredient: true },
    });
    return { item: this.toDto(updated), merged: true };
  }

  private resolveMergeQuantity(
    incomingQty: number,
    incomingUnit: string | null,
    existingQty: number,
    existingUnit: string | null,
  ): number {
    const from = normalize(incomingUnit);
    const to = normalize(existingUnit);
    if (from && to && from !== to) {
      const fromKind = kindOf(from);
      const toKind = kindOf(to);
      if (fromKind != null && toKind != null && fromKind === toKind) {
        try {
          return existingQty + convert(incomingQty, from, to);
        } catch {
          // fall through to raw add
        }
      }
    }
    return existingQty + incomingQty;
  }

  private resolveCreateFields(dto: CreatePantryItemRequestDto): {
    ingredient_id?: string;
    name?: string;
    quantity: number;
    unit?: string;
    notes?: string;
  } {
    const details = dto.details ?? {};
    return {
      ingredient_id: dto.ingredient_id ?? details.ingredient_id,
      name: dto.name,
      quantity: Number(dto.quantity ?? details.quantity ?? 0),
      unit: dto.unit ?? details.unit,
      notes: dto.notes ?? details.notes,
    };
  }

  private async resolveIngredient(input: {
    ingredient_id?: string;
    name?: string;
  }): Promise<Ingredient> {
    if (input.ingredient_id) {
      const ingredient = await this.prisma.ingredient.findUnique({
        where: { id: input.ingredient_id },
      });
      if (!ingredient) {
        throw new NotFoundError('Ingredient not found');
      }
      return ingredient;
    }

    const name = input.name?.trim();
    if (name) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        return existing;
      }

      const now = BigInt(nowUnixSeconds());
      return this.prisma.ingredient.create({
        data: {
          name,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    throw new NotFoundError('Ingredient not found');
  }

  private toDto(item: PantryItemWithIngredient): PantryItemDto {
    const ingredient = item.ingredient;
    return {
      id: item.id,
      name: ingredient?.name ?? 'Unknown',
      ingredient_id: item.ingredientId,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
      unit_kind: ingredient
        ? unitKindToApiValue(resolveKind(ingredient))
        : null,
      base_unit: ingredient ? resolveBaseUnit(ingredient) : null,
      default_display_unit: ingredient
        ? resolveDisplayUnit(ingredient)
        : null,
      created_at: bigintToNumber(item.createdAt),
      updated_at: bigintToNumber(item.updatedAt),
    };
  }
}
