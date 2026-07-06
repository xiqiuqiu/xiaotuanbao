const lastLoginFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatLastLogin(value: string | null) {
  if (!value) {
    return '从未登录'
  }

  return lastLoginFormatter.format(new Date(value))
}
