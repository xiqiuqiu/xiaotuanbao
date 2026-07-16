import { Spin } from 'antd'

/** 路由懒加载 chunk 尚未就绪时的占位。 */
export function RoutePendingState() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 240,
      }}
    >
      <Spin />
    </div>
  )
}
