import { Badge, Card, Flex, Radio, Segmented, Tabs, Typography, theme } from 'antd'
import { AppstoreOutlined, CalendarOutlined } from '@ant-design/icons'
import type { CSSProperties } from 'react'
import { LayerStateHint, MockDayAxisStrip, MockExecutionTabStrip } from './parts'
import type { ExecutionLayer } from './shared'
import { DEPARTURE_PENDING_PAYABLE } from './shared'
import styles from './execution-layer-switch-prototype.module.css'

type VariantProps = {
  layer: ExecutionLayer
  onLayerChange: (layer: ExecutionLayer) => void
}

function DepartureLabel() {
  return (
    <span className={styles.departureLabel}>
      发团级资源
      {DEPARTURE_PENDING_PAYABLE > 0 ? (
        <Badge count={DEPARTURE_PENDING_PAYABLE} size="small" color="warning" />
      ) : null}
    </span>
  )
}

function useExecutionTokens(): CSSProperties {
  const { token } = theme.useToken()
  return {
    '--execution-border': token.colorBorderSecondary,
    '--execution-border-subtle': token.colorSplit,
    '--execution-segmented-track': token.colorFillAlter,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
    '--execution-primary': token.colorPrimary,
  } as CSSProperties
}

/** A — 全宽 Segmented 轨道（当前生产方向）。 */
export function VariantA({ layer, onLayerChange }: VariantProps) {
  const tokenStyle = useExecutionTokens()
  return (
    <div className={styles.variantStack} style={tokenStyle}>
      <MockExecutionTabStrip />
      <div className={styles.variantA_switch}>
        <Segmented
          block
          value={layer}
          options={[
            { label: '按日资源', value: 'day', icon: <CalendarOutlined /> },
            { label: <DepartureLabel />, value: 'departure', icon: <AppstoreOutlined /> },
          ]}
          onChange={(value) => onLayerChange(value as ExecutionLayer)}
        />
      </div>
      <LayerStateHint layer={layer} />
      {layer === 'day' ? <MockDayAxisStrip /> : <div className={styles.placeholderPane}>发团级资源表格占位</div>}
    </div>
  )
}

/** B — 线型 Tab，去掉灰底条，与顶栏 Tab 视觉一脉相承。 */
export function VariantB({ layer, onLayerChange }: VariantProps) {
  return (
    <div className={styles.variantStack}>
      <MockExecutionTabStrip />
      <Tabs
        className={styles.variantB_tabs}
        activeKey={layer}
        items={[
          {
            key: 'day',
            label: (
              <span className={styles.tabLabel}>
                <CalendarOutlined />
                按日资源
              </span>
            ),
          },
          {
            key: 'departure',
            label: (
              <span className={styles.tabLabel}>
                <AppstoreOutlined />
                <DepartureLabel />
              </span>
            ),
          },
        ]}
        onChange={(key) => onLayerChange(key as ExecutionLayer)}
      />
      <LayerStateHint layer={layer} />
      {layer === 'day' ? <MockDayAxisStrip /> : <div className={styles.placeholderPane}>发团级资源表格占位</div>}
    </div>
  )
}

/** C — 紧凑工具条：左说明、右 Radio，不占满宽灰带。 */
export function VariantC({ layer, onLayerChange }: VariantProps) {
  return (
    <div className={styles.variantStack}>
      <MockExecutionTabStrip />
      <Flex align="center" justify="space-between" gap={12} className={styles.variantC_toolbar}>
        <div>
          <Typography.Text strong>资源范围</Typography.Text>
          <Typography.Text type="secondary" className={styles.variantC_hint}>
            切换按日或发团级资源视图
          </Typography.Text>
        </div>
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          value={layer}
          onChange={(event) => onLayerChange(event.target.value as ExecutionLayer)}
          options={[
            { label: '按日资源', value: 'day' },
            { label: '发团级资源', value: 'departure' },
          ]}
        />
      </Flex>
      <LayerStateHint layer={layer} />
      {layer === 'day' ? <MockDayAxisStrip /> : <div className={styles.placeholderPane}>发团级资源表格占位</div>}
    </div>
  )
}

/** D — 切换器并入内容 Card 页眉，取消独立灰条层。 */
export function VariantD({ layer, onLayerChange }: VariantProps) {
  const tokenStyle = useExecutionTokens()
  return (
    <div className={styles.variantStack}>
      <MockExecutionTabStrip />
      <Card
        className={styles.variantD_card}
        styles={{ body: { paddingTop: 0 } }}
        title={
          <Flex align="center" justify="space-between" gap={12} wrap="wrap">
            <Typography.Text strong>执行资源</Typography.Text>
            <div className={styles.variantD_switch} style={tokenStyle}>
              <Segmented
                value={layer}
                options={[
                  { label: '按日', value: 'day', icon: <CalendarOutlined /> },
                  { label: '发团级', value: 'departure', icon: <AppstoreOutlined /> },
                ]}
                onChange={(value) => onLayerChange(value as ExecutionLayer)}
              />
            </div>
          </Flex>
        }
      >
        <LayerStateHint layer={layer} />
        {layer === 'day' ? <MockDayAxisStrip /> : <div className={styles.placeholderPane}>发团级资源表格占位</div>}
      </Card>
    </div>
  )
}
