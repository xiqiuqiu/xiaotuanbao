import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { BookingNoticeTemplateSummary } from '@xiaotuanbao/shared'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreateBookingNoticeTemplateDto,
  UpdateBookingNoticeTemplateDto,
} from './dto/product.dto'

@Injectable()
export class BookingNoticeTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<BookingNoticeTemplateSummary[]> {
    const rows = await this.prisma.bookingNoticeTemplate.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    })
    return rows.map((row) => this.toSummary(row))
  }

  async getById(
    organizationId: string,
    templateId: string,
  ): Promise<BookingNoticeTemplateSummary> {
    return this.toSummary(await this.findOrThrow(organizationId, templateId))
  }

  async create(
    organizationId: string,
    dto: CreateBookingNoticeTemplateDto,
  ): Promise<BookingNoticeTemplateSummary> {
    const name = dto.name.trim()
    const content = dto.content.trim()
    if (!name || !content) {
      throw new BadRequestException('模板名称与内容不能为空')
    }

    try {
      const row = await this.prisma.bookingNoticeTemplate.create({
        data: { organizationId, name, content },
      })
      return this.toSummary(row)
    } catch (error) {
      throwIfUniqueNameConflict(error)
      throw error
    }
  }

  async update(
    organizationId: string,
    templateId: string,
    dto: UpdateBookingNoticeTemplateDto,
  ): Promise<BookingNoticeTemplateSummary> {
    await this.findOrThrow(organizationId, templateId)

    const data: { name?: string; content?: string } = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('模板名称不能为空')
      }
      data.name = name
    }
    if (dto.content !== undefined) {
      const content = dto.content.trim()
      if (!content) {
        throw new BadRequestException('模板内容不能为空')
      }
      data.content = content
    }

    try {
      const row = await this.prisma.bookingNoticeTemplate.update({
        where: { id: templateId },
        data,
      })
      return this.toSummary(row)
    } catch (error) {
      throwIfUniqueNameConflict(error)
      throw error
    }
  }

  async delete(organizationId: string, templateId: string): Promise<void> {
    await this.findOrThrow(organizationId, templateId)
    await this.prisma.bookingNoticeTemplate.delete({ where: { id: templateId } })
  }

  private async findOrThrow(organizationId: string, templateId: string) {
    const row = await this.prisma.bookingNoticeTemplate.findFirst({
      where: { id: templateId, organizationId },
    })
    if (!row) {
      throw new NotFoundException('报名须知模板不存在')
    }
    return row
  }

  private toSummary(row: {
    id: string
    name: string
    content: string
    createdAt: Date
    updatedAt: Date
  }): BookingNoticeTemplateSummary {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

function throwIfUniqueNameConflict(error: unknown): void {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException('同组织下模板名称已存在')
  }
}
