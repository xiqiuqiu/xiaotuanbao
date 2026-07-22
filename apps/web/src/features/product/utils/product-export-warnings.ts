import { message } from 'antd'

/** 特色 / 详细行程 / 须知缺失不阻断导出，仅提示（#152）。 */
export function warnProductExportGaps(product: {
  features: Array<unknown>
  bookingNotice: string | null
  detailedItinerary: string | null
}): void {
  const gaps: string[] = []
  if (product.features.length === 0) {
    gaps.push('特色')
  }
  if (!product.detailedItinerary?.trim()) {
    gaps.push('详细行程')
  }
  if (!product.bookingNotice?.trim()) {
    gaps.push('报名须知')
  }
  if (gaps.length > 0) {
    message.warning(`已导出；以下栏目为空：${gaps.join('、')}`)
  }
}
