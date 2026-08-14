import type { GetTaskContextOutput, MaterialParseIndexItem } from '@xiaotuanbao/ai-contracts'

export const PINNED_PARSE_CONTEXT_PREFACE =
  '以下发团资料已解析完成，不是待解析、解析中或尚未处理。当前上下文只包含事实索引和摘录，不是全文。原文证据必须用 getMaterialParseResult 按 materialId、parseResultVersion 和可选 pageNumber 读取。禁止把它们说成待解析。'

export function composeSyncedHeadlessUserText(
  userText: string,
  materials: MaterialParseIndexItem[] | GetTaskContextOutput['materials'] = [],
): string {
  if (!materials || materials.length === 0) {
    return userText
  }
  const blocks = materials.map((item) => {
    const clip = item.truncated ? '，摘录已裁剪' : ''
    const excerpt = item.excerpt?.trim() ? `\n摘录：${item.excerpt}` : ''
    return `资料 ${item.materialId}（解析版本 ${item.parseResultVersion}，已解析完成，共 ${item.pageCount} 页${clip}）${excerpt}`
  })
  return `${userText}\n\n${PINNED_PARSE_CONTEXT_PREFACE}\n\n${blocks.join('\n\n')}`
}
