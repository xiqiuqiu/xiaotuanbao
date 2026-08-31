import type { CSSProperties } from 'react'
import styles from './chat-working-mascot.module.css'

/** Chat-scale: readable squash / trails at ~48–56 CSS px. */
export const CHAT_WORKING_MASCOT_SIZE = 56

/** Recording body ink — medium gray (`gris`). */
const BODY_INK = '#a3a3a3'
const EYE_PAPER = '#f9f9f9'

const TRAIL_LIME = '#a3e635'
const TRAIL_CYAN = '#22d3ee'
const TRAIL_ORANGE = '#fb923c'
const TRAIL_MAGENTA = '#e879f9'

/** Min stroke ~1.5 CSS px at 56px display (viewBox 100). */
const TRAIL_STROKE = 2.8

export interface ChatWorkingMascotProps {
  size?: number
  playing?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

/**
 * Grok-like chat working indicator from Betty's recording:
 * gray horizontal capsule + white slit eyes, squash → tumble → rainbow trails loop.
 *
 * Shell/render layer only — does **not** use bloub catalog `play/orbit/burst/comet`
 * (those set `baseBody: false` and destroy the capsule).
 */
export function ChatWorkingMascot({
  size = CHAT_WORKING_MASCOT_SIZE,
  playing = true,
  className,
  style,
  'aria-label': ariaLabel = 'Agent 正在工作',
}: ChatWorkingMascotProps) {
  const rootClass = [styles.root, className].filter(Boolean).join(' ')

  return (
    <svg
      className={rootClass}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel}
      data-mascot-preset="working"
      data-mascot-visual="chat-working"
      data-mascot-state="chat-working"
      data-playing={playing ? 'true' : 'false'}
      style={style}
    >
      <g className={styles.scene}>
        {/* Trails sit behind the body; dasharray lets CSS animate sweep. */}
        <path
          className={`${styles.trail} ${styles.trailLime}`}
          d="M 28 62 C 18 78, 12 88, 22 92"
          stroke={TRAIL_LIME}
          strokeWidth={TRAIL_STROKE}
          strokeDasharray="36 48"
        />
        <path
          className={`${styles.trail} ${styles.trailCyan}`}
          d="M 34 66 C 20 82, 8 94, 18 98"
          stroke={TRAIL_CYAN}
          strokeWidth={2.5}
          strokeDasharray="40 52"
        />
        <path
          className={`${styles.trail} ${styles.trailOrange}`}
          d="M 40 68 C 26 84, 14 96, 28 99"
          stroke={TRAIL_ORANGE}
          strokeWidth={2.4}
          strokeDasharray="32 44"
        />
        <path
          className={`${styles.trail} ${styles.trailMagenta}`}
          d="M 24 58 C 10 72, 4 86, 14 90"
          stroke={TRAIL_MAGENTA}
          strokeWidth={2.2}
          strokeDasharray="28 40"
        />

        <g className={styles.body}>
          {/* Horizontal capsule — hull of two disks (matches skin `capsule` silhouette). */}
          <rect x="18" y="34" width="64" height="32" rx="16" ry="16" fill={BODY_INK} />
          {/* Vertical white slit eyes, biased toward the left end (recording rest pose). */}
          <rect x="32" y="42" width="3.2" height="14" rx="1.6" fill={EYE_PAPER} />
          <rect x="40" y="42" width="3.2" height="14" rx="1.6" fill={EYE_PAPER} />
        </g>
      </g>
    </svg>
  )
}
