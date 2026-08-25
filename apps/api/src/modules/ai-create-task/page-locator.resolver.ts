import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import {
  PAGE_LOCATOR_UNSUPPORTED,
  parsePageLocator,
  type PageLocator,
} from '@xiaotuanbao/shared'
import { AuthService } from '../auth/auth.service'
import { DepartureService } from '../departure/departure.service'
import { PartnerService } from '../partner/partner.service'

export type ResolvedPageContext = {
  locator: PageLocator
  objectVersion: number
  facts: Record<string, unknown>
}

const MENU_KEY_BY_KIND = {
  partner: '/partner',
  departure: '/departure',
} as const

@Injectable()
export class PageLocatorResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly partnerService: PartnerService,
    private readonly departureService: DepartureService,
  ) {}

  parseSubmitted(value: unknown): PageLocator | undefined {
    if (value == null) {
      return undefined
    }
    const locator = parsePageLocator(value)
    if (!locator) {
      throw new BadRequestException({
        code: PAGE_LOCATOR_UNSUPPORTED,
        message: '不支持的页面 locator',
      })
    }
    return locator
  }

  async resolve(
    organizationId: string,
    userId: string,
    value: unknown,
  ): Promise<ResolvedPageContext | undefined> {
    const locator = this.parseSubmitted(value)
    if (!locator) {
      return undefined
    }
    const permissionKeys = await this.authService.getPermissionKeysForUser(userId)
    const requiredMenu = MENU_KEY_BY_KIND[locator.kind]
    if (!permissionKeys.includes(requiredMenu)) {
      throw new ForbiddenException('无权读取当前业务页面')
    }
    try {
      if (locator.kind === 'partner') {
        const partner = await this.partnerService.getById(organizationId, locator.objectId)
        return {
          locator,
          objectVersion: Date.parse(partner.updatedAt),
          facts: {
            kind: locator.kind,
            objectId: partner.id,
            name: partner.name,
            status: partner.status,
            updatedAt: partner.updatedAt,
            section: locator.section ?? null,
          },
        }
      }
      const departure = await this.departureService.getById(organizationId, locator.objectId)
      return {
        locator,
        objectVersion: Date.parse(departure.updatedAt),
        facts: {
          kind: locator.kind,
          objectId: departure.id,
          name: departure.name,
          departureNo: departure.departureNo,
          status: departure.status,
          updatedAt: departure.updatedAt,
          section: locator.section ?? null,
        },
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      throw new BadRequestException({
        code: PAGE_LOCATOR_UNSUPPORTED,
        message: '无法解析当前业务页面',
      })
    }
  }
}
