import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  sampleChatWorkingPose,
  type ChatWorkingActiveBeat,
  type ChatWorkingBeatMode,
} from './chat-working-motion'
import styles from './chat-working-mascot.module.css'

/** Chat-scale: readable beats at ~48–56 CSS px. */
export const CHAT_WORKING_MASCOT_SIZE = 56

export type { ChatWorkingBeatMode, ChatWorkingActiveBeat }

const BODY_INK = '#a3a3a3'
const EYE_PAPER = '#f9f9f9'

const LIME = '#a3e635'
const LIME_BRIGHT = '#3dff8a'
const CYAN = '#22d3ee'
const BLUE = '#4da3ff'
const ORANGE = '#fb923c'
const MAGENTA = '#e879f9'
const PURPLE = '#8b7cff'
const RED = '#ff4b6b'

/** Min stroke ~1.5 CSS px at 56px (viewBox 100 → ≥ ~2.6). */
const STROKE = 2.7

const TRAIL_PATHS = [
  { d: 'M26 66 C4 59 -9 36 -3 18 C3 5 20 4 41 14', stroke: LIME, width: STROKE },
  { d: 'M23 59 C-2 48 -11 26 5 11 C14 2 31 1 47 12', stroke: PURPLE, width: STROKE * 0.95 },
  { d: 'M29 72 C8 64 -4 40 2 22 C9 9 27 7 44 18', stroke: RED, width: STROKE * 0.9 },
  { d: 'M20 54 C-7 44 -4 20 11 9 C22 1 35 5 43 16', stroke: BLUE, width: STROKE * 0.92 },
] as const

export interface ChatWorkingMascotProps {
  /**
   * `loop` = full chat cycle. Any other value holds/loops that single audit clip.
   * @default 'loop'
   */
  beat?: ChatWorkingBeatMode
  size?: number
  playing?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

function applyPose(
  body: SVGGElement | null,
  eyes: SVGGElement | null,
  trails: SVGGElement | null,
  trailPaths: SVGPathElement[],
  halo: SVGGElement | null,
  pose: ReturnType<typeof sampleChatWorkingPose>,
  haloSpinDeg: number,
) {
  if (body) {
    const ty = pose.ty + pose.bob
    body.setAttribute(
      'transform',
      `translate(${pose.tx} ${ty}) translate(50 50) rotate(${pose.rotate}) scale(${pose.sx} ${pose.sy}) translate(-50 -50)`,
    )
  }
  if (eyes) {
    eyes.setAttribute(
      'transform',
      `translate(${pose.eyeX} ${pose.eyeY}) translate(37.6 49) scale(1 ${pose.eyeSy}) translate(-37.6 -49)`,
    )
  }
  if (trails) {
    trails.setAttribute('opacity', String(pose.trail))
  }
  for (const path of trailPaths) {
    path.setAttribute('stroke-dashoffset', String(pose.dash))
  }
  if (halo) {
    halo.setAttribute('opacity', String(pose.halo))
    halo.setAttribute('transform', `rotate(${haloSpinDeg} 50 50)`)
  }
}

/**
 * Recording capsule working indicator — multi-beat, holdable for audit.
 *
 * Hull stays gray capsule + slit eyes every beat. Halo = rings around the pill
 * (never bloub orbit-triangle). Shell layer only — does not touch bot/.
 */
export function ChatWorkingMascot({
  beat: beatMode = 'loop',
  size = CHAT_WORKING_MASCOT_SIZE,
  playing = true,
  className,
  style,
  'aria-label': ariaLabel = 'Agent 正在工作',
}: ChatWorkingMascotProps) {
  const reducedMotion = usePrefersReducedMotion()
  const bodyRef = useRef<SVGGElement | null>(null)
  const eyesRef = useRef<SVGGElement | null>(null)
  const trailsRef = useRef<SVGGElement | null>(null)
  const haloRef = useRef<SVGGElement | null>(null)
  const trailPathRef = useRef<SVGPathElement[]>([])
  const initialBeat: ChatWorkingActiveBeat =
    beatMode === 'loop' ? 'look' : beatMode
  const [activeBeat, setActiveBeat] = useState<ChatWorkingActiveBeat>(initialBeat)
  const beatRef = useRef<ChatWorkingActiveBeat>(initialBeat)

  useEffect(() => {
    beatRef.current = beatMode === 'loop' ? 'look' : beatMode
    setActiveBeat(beatRef.current)
  }, [beatMode])

  useEffect(() => {
    const freeze = reducedMotion || !playing
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const t = freeze ? 0 : now - start
      const pose = freeze
        ? {
            ...sampleChatWorkingPose(0, beatMode === 'loop' ? 'look' : beatMode),
            beat: (beatMode === 'loop' ? 'rest' : beatMode) as ChatWorkingActiveBeat,
            trail: 0,
            halo: beatMode === 'halo' ? 0.8 : 0,
            eyeX: 0,
            eyeY: 0,
            eyeSy: 1,
            bob: 0,
            rotate: 0,
            sx: 1,
            sy: 1,
            tx: 0,
            ty: 0,
            dash: 0,
          }
        : sampleChatWorkingPose(t, beatMode)
      const haloSpin = freeze ? 0 : (t / 1000) * 120

      applyPose(
        bodyRef.current,
        eyesRef.current,
        trailsRef.current,
        trailPathRef.current,
        haloRef.current,
        pose,
        haloSpin,
      )

      if (pose.beat !== beatRef.current) {
        beatRef.current = pose.beat
        setActiveBeat(pose.beat)
      }

      if (!freeze) raf = requestAnimationFrame(tick)
    }

    tick(freeze ? 0 : performance.now())
    if (!freeze) raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [playing, reducedMotion, beatMode])

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
      data-mascot-beat={activeBeat}
      data-mascot-beat-mode={beatMode}
      data-playing={playing && !reducedMotion ? 'true' : 'false'}
      style={style}
    >
      <g ref={haloRef} className={styles.halo} data-part="halo" opacity={0}>
        <ellipse
          cx="50"
          cy="50"
          rx="42"
          ry="28"
          stroke={LIME}
          strokeWidth={STROKE}
          transform="rotate(-18 50 50)"
        />
        <ellipse
          cx="50"
          cy="50"
          rx="38"
          ry="24"
          stroke={CYAN}
          strokeWidth={STROKE * 0.95}
          transform="rotate(32 50 50)"
        />
        <ellipse
          cx="50"
          cy="50"
          rx="44"
          ry="22"
          stroke={ORANGE}
          strokeWidth={STROKE * 0.9}
          transform="rotate(-55 50 50)"
        />
        <ellipse
          cx="50"
          cy="50"
          rx="36"
          ry="26"
          stroke={MAGENTA}
          strokeWidth={STROKE * 0.92}
          transform="rotate(70 50 50)"
        />
        <path
          d="M18 50 A32 20 0 0 1 50 30"
          stroke={LIME_BRIGHT}
          strokeWidth={STROKE * 0.85}
          fill="none"
        />
        <path
          d="M82 50 A32 20 0 0 1 50 70"
          stroke={PURPLE}
          strokeWidth={STROKE * 0.85}
          fill="none"
        />
      </g>

      <g ref={bodyRef} className={styles.body} data-part="body">
        <g
          ref={trailsRef}
          className={styles.trails}
          data-part="trails"
          opacity={0}
          fill="none"
        >
          {TRAIL_PATHS.map((trail, i) => (
            <path
              key={trail.stroke}
              ref={(el) => {
                if (el) trailPathRef.current[i] = el
              }}
              d={trail.d}
              stroke={trail.stroke}
              strokeWidth={trail.width}
              strokeDasharray="42 56"
              strokeDashoffset={0}
            />
          ))}
        </g>

        <rect
          data-part="hull"
          x="18"
          y="34"
          width="64"
          height="32"
          rx="16"
          ry="16"
          fill={BODY_INK}
        />

        <g ref={eyesRef} className={styles.eyes} data-part="eyes">
          <rect x="32" y="42" width="3.2" height="14" rx="1.6" fill={EYE_PAPER} />
          <rect x="40" y="42" width="3.2" height="14" rx="1.6" fill={EYE_PAPER} />
        </g>
      </g>
    </svg>
  )
}
