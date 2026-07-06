import type { MenuProps } from 'antd'

type MenuItem = Required<MenuProps>['items'][number]

export function filterMenuItems(items: MenuItem[] | undefined, menuKeys: string[]): MenuItem[] {
  if (!items) {
    return []
  }

  return items.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const item = entry as MenuItem & { children?: MenuItem[] }
    if (item.children?.length) {
      const children = filterMenuItems(item.children, menuKeys)
      if (children.length === 0) {
        return []
      }
      return [{ ...item, children }]
    }

    if (typeof item.key === 'string' && item.key.startsWith('/')) {
      return menuKeys.includes(item.key) ? [item] : []
    }

    return []
  })
}

export function isMenuPathAllowed(pathname: string, menuKeys: string[]): boolean {
  if (pathname === '/') {
    return menuKeys.includes('/')
  }

  return menuKeys.includes(pathname)
}
