import { Alert, Button } from 'antd'

type DepartureHeaderAlertsProps = {
  canUnarchive: boolean
  canTransitionToSettled: boolean
  onUnarchive: () => void
  onMarkSettled: () => void
}

export function DepartureHeaderAlerts({
  canUnarchive,
  canTransitionToSettled,
  onUnarchive,
  onMarkSettled,
}: DepartureHeaderAlertsProps) {
  return (
    <>
      {canUnarchive ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="发团已关闭，当前仅可查看"
          description="如需继续处理业务或财务事项，请先解除归档。解除后发团将回到待结算，原归档履历会保留。"
          action={
            <Button size="small" type="primary" onClick={onUnarchive}>
              解除归档
            </Button>
          }
        />
      ) : null}

      {canTransitionToSettled ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="全部账款已结清，可标记为已结清"
          action={
            <Button size="small" type="primary" onClick={onMarkSettled}>
              标记为已结清
            </Button>
          }
        />
      ) : null}
    </>
  )
}
