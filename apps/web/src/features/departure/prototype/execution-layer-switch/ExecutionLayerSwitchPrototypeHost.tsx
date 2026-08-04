import { useState } from 'react'
import { Alert, Typography } from 'antd'
import { useSearch } from '@tanstack/react-router'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import {
  PROTOTYPE_VARIANTS,
  type ExecutionLayer,
  type PrototypeVariantKey,
} from './shared'
import { VariantA, VariantB, VariantC, VariantD } from './variants'
import styles from './execution-layer-switch-prototype.module.css'

/**
 * PROTOTYPE — 执行安排「按日资源 / 发团级资源」切换器，4 种结构方案。
 * 切换：?variant=A|B|C|D + 底部浮动条 / 方向键。
 */
export function ExecutionLayerSwitchPrototypeHost() {
  const search = useSearch({ strict: false }) as { variant?: string }
  const variant = (PROTOTYPE_VARIANTS.some((item) => item.key === search.variant)
    ? search.variant
    : 'A') as PrototypeVariantKey
  const [layer, setLayer] = useState<ExecutionLayer>('day')

  return (
    <>
      <Alert
        type="info"
        showIcon
        className={styles.intro}
        title="执行安排 · 资源层级切换 — UI 原型"
        description={
          <Typography.Text type="secondary">
            对比四种结构：A 轨道 Segmented / B 线型 Tab / C 紧凑工具条 / D Card
            页眉内嵌。底部条或 ← → 切换方案；日程轴为 Mock，仅辅助判断层级切换与下方内容的色彩关系。
          </Typography.Text>
        }
      />

      {variant === 'A' ? <VariantA layer={layer} onLayerChange={setLayer} /> : null}
      {variant === 'B' ? <VariantB layer={layer} onLayerChange={setLayer} /> : null}
      {variant === 'C' ? <VariantC layer={layer} onLayerChange={setLayer} /> : null}
      {variant === 'D' ? <VariantD layer={layer} onLayerChange={setLayer} /> : null}

      <PrototypeSwitcher
        variants={[...PROTOTYPE_VARIANTS]}
        current={variant}
        searchKey="variant"
      />
    </>
  )
}
