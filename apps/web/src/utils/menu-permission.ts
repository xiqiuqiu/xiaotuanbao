import type { MenuProps } from 'antd'

type MenuItem = Required<MenuProps>['items'][number]

export function filterMenuItems(items: MenuItem[] | undefined, menuKeys: string[]): MenuItem[] {
  return filterMenuItemsByKeySet(items, new Set(menuKeys))
}

function filterMenuItemsByKeySet(
  items: MenuItem[] | undefined,
  menuKeySet: ReadonlySet<string>,
): MenuItem[] {
  if (!items) {
    return []
  }

  return items.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const item = entry as MenuItem & { children?: MenuItem[] }
    if (item.children?.length) {
      const children = filterMenuItemsByKeySet(item.children, menuKeySet)
      if (children.length === 0) {
        return []
      }
      return [{ ...item, children }]
    }

    if (typeof item.key === 'string' && item.key.startsWith('/')) {
      return menuKeySet.has(item.key) ? [item] : []
    }

    return []
  })
}

export function isMenuPathAllowed(pathname: string, menuKeys: string[]): boolean {
  if (pathname === '/') {
    return menuKeys.includes('/')
  }

  if (menuKeys.includes(pathname)) {
    return true
  }

  return menuKeys.some((key) => key !== '/' && pathname.startsWith(`${key}/`))
}
