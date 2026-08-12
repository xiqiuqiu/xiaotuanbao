import { useState, type CSSProperties } from 'react'
import { Alert, Typography, theme } from 'antd'
import { useSearch } from '@tanstack/react-router'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { AI_CREATE_VARIANTS, type AiCreateVariantKey, type CreateMode } from './shared'
import { VariantA, VariantB, VariantC, VariantD } from './variants'
import styles from './ai-assisted-create-prototype.module.css'

/**
 * PROTOTYPE — 现有 /departure/new 页面上的三种双模式建团结构。
 * 切换：?prototype=ai-assisted-create&variant=A|B|C|D + 底部浮动条 / 方向键。
 */
export function AiAssistedCreatePrototypeHost() {
  const { token } = theme.useToken()
  const search = useSearch({ strict: false }) as { variant?: string }
  const variant = (AI_CREATE_VARIANTS.some((item) => item.key === search.variant)
    ? search.variant
    : 'A') as AiCreateVariantKey
  const [mode, setMode] = useState<CreateMode>('ai')
  const [confirmed, setConfirmed] = useState(false)

  const tokenStyle = {
    '--ai-border': token.colorBorderSecondary,
    '--ai-split': token.colorSplit,
    '--ai-bg': token.colorBgContainer,
    '--ai-bg-layout': token.colorBgLayout,
    '--ai-bg-subtle': token.colorFillAlter,
    '--ai-primary-bg': token.colorPrimaryBg,
    '--ai-primary': token.colorPrimary,
    '--ai-text-secondary': token.colorTextSecondary,
    '--ai-shadow': token.boxShadowSecondary,
  } as CSSProperties

  return (
    <div style={tokenStyle}>
      <Alert
        type="info"
        showIcon
        className={styles.prototypeNotice}
        title="Issue #294 · AI 辅助新建发团 UI 原型"
        description={
          <Typography.Text type="secondary">
            比较三种信息架构。表单 / AI 切换与确认按钮可交互，全部数据均为 Mock，不会创建真实发团。
          </Typography.Text>
        }
      />

      {variant === 'A' ? <VariantA mode={mode} onModeChange={setMode} confirmed={confirmed} onConfirm={() => setConfirmed(true)} /> : null}
      {variant === 'B' ? <VariantB mode={mode} onModeChange={setMode} confirmed={confirmed} onConfirm={() => setConfirmed(true)} /> : null}
      {variant === 'C' ? <VariantC mode={mode} onModeChange={setMode} confirmed={confirmed} onConfirm={() => setConfirmed(true)} /> : null}
      {variant === 'D' ? <VariantD mode={mode} onModeChange={setMode} confirmed={confirmed} onConfirm={() => setConfirmed(true)} /> : null}

      <PrototypeSwitcher variants={[...AI_CREATE_VARIANTS]} current={variant} searchKey="variant" />
    </div>
  )
}
