import { useState, type ReactNode } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { Button, Flex, theme } from 'antd'

interface CollapsibleFilterBarProps {
  /** 主筛选行：出团日期、方向切换、导出等始终可见。 */
  primary: ReactNode
  /**
   * 次要筛选：默认折叠，点击「展开」后显示。
   * 不传则不渲染展开控件。
   */
  advanced?: ReactNode
  /** 次要筛选是否有生效条件（折叠时提示「已筛选」）。 */
  advancedActive?: boolean
}

/**
 * 列表页筛选条：对齐 antd Form「Advanced search」
 *（浅底容器 + 主行 + 「展开/收起」切换次要条件）。
 */
export function CollapsibleFilterBar({
  primary,
  advanced,
  advancedActive = false,
}: CollapsibleFilterBarProps) {
  const { token } = theme.useToken()
  const [expanded, setExpanded] = useState(false)
  const hasAdvanced = advanced != null

  return (
    <div
      style={{
        background: token.colorFillAlter,
        borderRadius: token.borderRadiusLG,
        padding: token.paddingMD,
      }}
    >
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Flex flex={1} align="center" gap={12} wrap style={{ minWidth: 0 }}>
          {primary}
        </Flex>
        {hasAdvanced ? (
          <Button
            type="link"
            size="small"
            aria-expanded={expanded}
            aria-label={expanded ? '收起' : advancedActive ? '展开（已筛选）' : '展开'}
            onClick={() => setExpanded((value) => !value)}
            style={{ paddingInline: 0 }}
          >
            <DownOutlined rotate={expanded ? 180 : 0} aria-hidden />{' '}
            {expanded ? '收起' : advancedActive ? '展开（已筛选）' : '展开'}
          </Button>
        ) : null}
      </Flex>

      {hasAdvanced && expanded ? (
        <div style={{ marginTop: token.marginMD }}>{advanced}</div>
      ) : null}
    </div>
  )
}
