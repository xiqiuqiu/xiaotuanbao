import { useCopilotKit } from '@copilotkit/react-core/v2'
import { Alert, Button } from 'antd'
import { useCallback, useEffect, useRef } from 'react'

export function CopilotRuntimeRecovery() {
  const { copilotkit } = useCopilotKit()
  const status = copilotkit.runtimeConnectionStatus
  const failures = useRef(0)
  const reconnect = useCallback(() => {
    const runtimeUrl = copilotkit.runtimeUrl
    if (!runtimeUrl || copilotkit.runtimeConnectionStatus !== 'error') return
    // The SDK ignores an unchanged URL after discovery fails; keep the mounted composer intact.
    copilotkit.setRuntimeUrl(undefined)
    copilotkit.setRuntimeUrl(runtimeUrl)
  }, [copilotkit])

  useEffect(() => {
    if (status === 'connected') failures.current = 0
    if (status !== 'error') return
    const timer = setTimeout(reconnect, Math.min(1000 * 2 ** failures.current++, 15_000))
    return () => clearTimeout(timer)
  }, [status, reconnect])

  useEffect(() => {
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [reconnect])

  return status === 'error' ? (
    <Alert
      type="warning"
      showIcon
      title="助手连接暂时中断，正在自动重连"
      action={<Button size="small" onClick={reconnect}>立即重连</Button>}
    />
  ) : null
}
