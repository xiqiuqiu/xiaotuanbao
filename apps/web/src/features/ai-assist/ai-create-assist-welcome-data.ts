export const AI_CREATE_WELCOME_SUGGESTIONS = [
  {
    title: '补全团名和路线',
    description: '根据当前草稿整理候选',
    message: '请根据当前草稿帮我补全团名和路线',
    icon: 'form',
  },
  {
    title: '查找常用路线',
    description: '在组织目录里匹配',
    message: '帮我查一下组织里的常用路线',
    icon: 'search',
  },
  {
    title: '说明团期和人数',
    description: '出团日期、天数或预计人数',
    message: '出团日期、结束日期和预计人数可以怎么填',
    icon: 'calendar',
  },
] as const

export function greetingForHour(hour: number): string {
  if (hour < 12) {
    return '上午好'
  }
  if (hour < 18) {
    return '下午好'
  }
  return '晚上好'
}
