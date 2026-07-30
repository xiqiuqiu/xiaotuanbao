import { useState } from 'react'
import { Alert, Button } from 'antd'
import type { DepartureDetail } from '@/types/api'
import {
  resolveDepartureNextAction,
  type DepartureNextAction,
} from '../utils/departure-next-action'
import {
  buildNextActionFingerprint,
  dismissNextAction,
  isNextActionDismissed,
} from '../utils/departure-next-action-dismiss'
import styles from './DepartureNextActionAlert.module.css'

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
  const fingerprint = nextAction ? buildNextActionFingerprint(nextAction) : null
  const [closed, setClosed] = useState<{
    departureId: string
    fingerprint: string
  } | null>(null)

  if (!nextAction || !fingerprint) {
    return null
  }

  const dismissed =
    (closed?.departureId === departure.id && closed.fingerprint === fingerprint) ||
    isNextActionDismissed(departure.id, fingerprint)

  if (dismissed) {
    return null
  }

  return (
    <Alert
      type={nextAction.type}
      showIcon
      closable
      className={styles.alert}
      title={nextAction.title}
      description={nextAction.description}
      onClose={() => {
        dismissNextAction(departure.id, fingerprint)
        setClosed({ departureId: departure.id, fingerprint })
      }}
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
