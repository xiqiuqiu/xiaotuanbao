import { SetMetadata } from '@nestjs/common'

export const REQUIRE_MENU_KEY = 'requireMenuKey'

export const RequireMenu = (menuKey: string) => SetMetadata(REQUIRE_MENU_KEY, menuKey)
