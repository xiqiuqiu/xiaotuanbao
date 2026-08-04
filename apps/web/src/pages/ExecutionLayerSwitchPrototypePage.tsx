import { PageHeader } from '@/layouts/PageHeader'
import { ExecutionLayerSwitchPrototypeHost } from '@/features/departure/prototype/execution-layer-switch/ExecutionLayerSwitchPrototypeHost'

/** PROTOTYPE page — 执行安排资源层级切换 UI 探索。 */
export function ExecutionLayerSwitchPrototypePage() {
  return (
    <>
      <PageHeader title="发团详情 · 执行安排（原型）" />
      <ExecutionLayerSwitchPrototypeHost />
    </>
  )
}
