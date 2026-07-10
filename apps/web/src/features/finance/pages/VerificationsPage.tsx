import { useSearch } from '@tanstack/react-router'
import { VerificationsWorkspace } from '../components/VerificationsWorkspace'

export function VerificationsPage() {
  const search = useSearch({ strict: false }) as {
    transactionNo?: string
    scheduleNo?: string
  }

  return (
    <VerificationsWorkspace
      scope="global"
      pageHeader={{
        title: '核销管理',
        description: '将财务流水与账款节点进行核销匹配',
      }}
      deepLinkSearch={{
        transactionNo: search.transactionNo,
        scheduleNo: search.scheduleNo,
      }}
    />
  )
}
