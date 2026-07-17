/** Login Username：trim 后转小写，供持久化与登录查找共用。 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}
