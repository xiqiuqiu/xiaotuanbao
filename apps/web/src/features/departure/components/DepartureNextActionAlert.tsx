import { Alert, Button } from 'antd'
import type { DepartureDetail } from '@/types/api'
import {
  resolveDepartureNextAction,
  type DepartureNextAction,
} from '../utils/departure-next-action'

type DepartureNextActionAlertProps = {
  departure: DepartureDetail
  canWrite: boolean
  onAction: (action: NonNullable<DepartureNextAction['action']>) => void
}

export function DepartureNextActionAlert({
  departure,
  canWrite,
  onAction,
}: DepartureNextActionAlertProps) {
  const nextAction = resolveDepartureNextAction({ departure, canWrite })
  if (!nextAction) {
    return null
  }

  return (
    <Alert
      type={nextAction.type}
      showIcon
      style={{ marginBottom: 16 }}
      title={nextAction.title}
      description={nextAction.description}
      action={
        nextAction.action ? (
          <Button size="small" onClick={() => onAction(nextAction.action!)}>
            {nextAction.action.label}
          </Button>
        ) : undefined
      }
    />
  )
}
