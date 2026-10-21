import { useCopilotKit } from '@copilotkit/react-core/v2'
import { Alert, Button } from 'antd'
import { useCallback, useEffect, useState } from 'react'

type Failure = 'authentication' | 'configuration' | 'temporary'
const MAX_AUTOMATIC_RETRIES = 3

export function CopilotRuntimeRecovery() {
  const { copilotkit } = useCopilotKit()
  const status = copilotkit.runtimeConnectionStatus
  const [failure, setFailure] = useState<Failure | null>(null)
  const [otherError, setOtherError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden')

  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onError: ({ code, error }) => {
        if (code !== 'runtime_info_fetch_failed') {
          setOtherError(error.message)
          return
        }
        const httpStatus = Number(error.message.match(/Runtime info request failed with status (\d{3})/)?.[1])
        setFailure(httpStatus === 401 || httpStatus === 403 ? 'authentication'
          : httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429
            ? 'configuration' : 'temporary')
      },
      onRuntimeConnectionStatusChanged: ({ status: next }) => {
        if (next === 'connected') {
          setFailure(null)
          setAttempts(0)
        }
      },
    })
    return () => { subscription.unsubscribe() }
  }, [copilotkit])

  const reconnect = useCallback((manual = false) => {
    const runtimeUrl = copilotkit.runtimeUrl
    if (!runtimeUrl || copilotkit.runtimeConnectionStatus !== 'error' || document.visibilityState === 'hidden') return
    if (!manual && (failure !== 'temporary' || attempts >= MAX_AUTOMATIC_RETRIES)) return
    setAttempts(manual ? 0 : attempts + 1)
    // An unchanged URL does not reconnect the SDK; keep the existing composer mounted.
    copilotkit.setRuntimeUrl(undefined)
    copilotkit.setRuntimeUrl(runtimeUrl)
  }, [copilotkit, failure, attempts])

  useEffect(() => {
    if (status !== 'error' || failure !== 'temporary' || !visible || attempts >= MAX_AUTOMATIC_RETRIES) return
    const timer = setTimeout(() => reconnect(), 1000 * 2 ** attempts)
    return () => clearTimeout(timer)
  }, [status, failure, visible, attempts, reconnect])

  useEffect(() => {
    const online = () => reconnect()
    const visibilityChanged = () => {
      const next = document.visibilityState !== 'hidden'
      setVisible(next)
      if (next) reconnect()
    }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [reconnect])

  const title = failure === 'authentication' ? '助手连接认证失败，请重新登录后重试'
    : failure === 'configuration' ? '助手连接配置有误，请检查服务地址后重试'
      : status === 'error' && attempts >= MAX_AUTOMATIC_RETRIES ? '助手连接失败，自动重试已停止，请手动重连'
        : !visible ? '助手连接暂时中断，返回此页面后继续重连'
          : '助手连接暂时中断，正在自动重连'

  return <>
    {failure ? <Alert
      role="status"
      type="warning"
      showIcon
      title={title}
      action={<Button size="small" aria-label="立即重连" loading={status === 'connecting'} onClick={() => reconnect(true)}>立即重连</Button>}
    /> : null}
    {otherError ? <Alert type="error" showIcon title="助手交互发生错误" description={otherError}
      closable={{ onClose: () => setOtherError(null) }} /> : null}
  </>
}
