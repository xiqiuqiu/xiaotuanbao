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
      className={styles.alertCompact}
      title={
        <span className={styles.line}>
          <span className={styles.copy}>
            <span className={styles.title}>{nextAction.title}</span>
            {nextAction.description ? (
              <span className={styles.detail}>{nextAction.description}</span>
            ) : null}
          </span>
          {nextAction.action ? (
            <Button
              size="small"
              type="link"
              className={styles.cta}
              onClick={() => onAction(nextAction.action!)}
            >
              {nextAction.action.label}
            </Button>
          ) : null}
        </span>
      }
      onClose={() => {
        dismissNextAction(departure.id, fingerprint)
        setClosed({ departureId: departure.id, fingerprint })
      }}
    />
  )
}
