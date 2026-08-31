import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { NOTIF_BLUE } from './bot/decor'
import { BotEngine, type BotFrame } from './bot/engine'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from './bot/expressions'
import { lookTarget, TURN_TIME } from './bot/gaze'
import { clamp, easings } from './bot/math'
import { DEMI_VIEWBOX, RAYON } from './bot/repere'
import {
  COLOR_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  mixHex,
  SHAPE_BY_ID,
  type ColorId,
  type ShapeId,
} from './bot/skins'
import { STATE_BY_ID, type StateId } from './bot/states'
import {
  resolveMascotPlayback,
  type MascotPreset,
  type MascotStateId,
} from './mascot-presets'
import { resolveArcStrokeWidth } from './mascot-stroke'
import styles from './Mascot.module.css'

const CHAT_PAPER = '#f9f9f9'
const DEFAULT_SIZE = 28

export type { MascotPreset, MascotStateId }

export interface MascotProps {
  /** Hold one SEQUENCE state. Overridden by `preset` / `cycle`. */
  state?: MascotStateId
  /** Play a timeline of SEQUENCE states (measured durations). Highest precedence. */
  cycle?: MascotStateId[]
  /**
   * Product preset. Precedence: `cycle` > `preset` > `state` > idle.
   * See `MASCOT_PRESET_RESOLUTION` for the measured mapping.
   */
  preset?: MascotPreset
  /** Advance multi-block cycles when true. Default true. */
  playing?: boolean
  /** Pixel size. Chat default ~26–28. */
  size?: number
  /** Skin color id (`encre`) or hex. Default encre / #0a0a0c. */
  color?: ColorId | string
  /** Skin shape id. Default `cercle`. */
  shape?: ShapeId | string
  /** Pointer gaze follow. Default false in chat. */
  follow?: boolean
  /** Backdrop fill behind eye holes. Light chat paper default. */
  paper?: string
  onStateChange?: (state: MascotStateId) => void
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

function resolveInk(color: string | undefined): string {
  if (!color) return COLOR_BY_ID.get(DEFAULT_COLOR)?.hex ?? '#0a0a0c'
  if (color.startsWith('#')) return color
  return COLOR_BY_ID.get(color)?.hex ?? color
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

function useStableId(prefix: string): string {
  const reactId = useId().replace(/:/g, '')
  return `${prefix}-${reactId}`
}

/**
 * Drop-in React mascot: framework-free bloub `BotEngine.sample(t)` + SVG mask-hole eyes.
 * Parent drives `state` / `preset` / `cycle`; no internal product FSM.
 */
export function Mascot({
  state,
  cycle,
  preset,
  playing = true,
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  shape = DEFAULT_SHAPE,
  follow = false,
  paper = CHAT_PAPER,
  onStateChange,
  className,
  style,
  'aria-label': ariaLabel = '助手形象',
}: MascotProps) {
  const reducedMotion = usePrefersReducedMotion()
  const uid = useStableId('mascot')
  const maskId = `${uid}-mask`
  const svgRef = useRef<SVGSVGElement | null>(null)
  const engineRef = useRef<BotEngine | null>(null)
  const clockRef = useRef(0)
  const lastMsRef = useRef(0)
  const blockIndexRef = useRef(0)
  const blockStartRef = useRef(0)
  const nextAtRef = useRef(Infinity)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const aimingRef = useRef(false)
  const turnSinceRef = useRef(0)
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange

  const plan = useMemo(
    () =>
      reducedMotion
        ? resolveMascotPlayback({ state: 'idle' })
        : resolveMascotPlayback({ cycle, preset, state }),
    [cycle, preset, reducedMotion, state],
  )

  const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? null
  const ink = resolveInk(color)
  const expression = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null
  const R = RAYON
  const VB = DEMI_VIEWBOX

  const [frame, setFrame] = useState<BotFrame>(() => {
    const engine = new BotEngine(R, plan.initialState, shapeRadii, expression)
    engineRef.current = engine
    return engine.sample(0)
  })
  const [activeState, setActiveState] = useState<MascotStateId>(plan.initialState)
  const activeStateRef = useRef<MascotStateId>(plan.initialState)

  useLayoutEffect(() => {
    const engine = new BotEngine(R, plan.initialState, shapeRadii, expression)
    engineRef.current = engine
    clockRef.current = 0
    lastMsRef.current = 0
    blockIndexRef.current = 0
    blockStartRef.current = 0
    const first = plan.blocks[0]
    nextAtRef.current =
      !reducedMotion && playing && plan.blocks.length > 1 && first
        ? first.duration
        : Infinity
    activeStateRef.current = plan.initialState
    setActiveState(plan.initialState)
    setFrame(engine.sample(0))
    onStateChangeRef.current?.(plan.initialState)
  }, [expression, plan, playing, R, reducedMotion, shapeRadii])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setShape(shapeRadii, clockRef.current)
  }, [shapeRadii])

  useEffect(() => {
    if (reducedMotion) return

    const applyBlock = (index: number, from = 0) => {
      const engine = engineRef.current
      const block = plan.blocks[index]
      if (!engine || !block) {
        nextAtRef.current = Infinity
        return
      }
      blockStartRef.current = clockRef.current - from
      engine.setState(block.state, clockRef.current)
      nextAtRef.current =
        playing && plan.blocks.length > 1
          ? blockStartRef.current + block.duration
          : Infinity
      const nextState = block.state as MascotStateId
      if (nextState !== activeStateRef.current) {
        activeStateRef.current = nextState
        setActiveState(nextState)
        onStateChangeRef.current?.(nextState)
      }
    }

    const releaseLook = () => {
      const engine = engineRef.current
      if (!engine || !aimingRef.current) return
      engine.setLook(null, clockRef.current, TURN_TIME)
      aimingRef.current = false
    }

    const aim = () => {
      const engine = engineRef.current
      const current = plan.blocks[blockIndexRef.current]?.state ?? plan.initialState
      if (!engine) return
      if (!STATE_BY_ID.get(current as StateId)?.baseFace) {
        releaseLook()
        return
      }
      const box = svgRef.current?.getBoundingClientRect()
      if (!box || box.width === 0 || box.height === 0) return
      const pointer = pointerRef.current
      if (!aimingRef.current) turnSinceRef.current = clockRef.current
      const demiLargeur = Math.max(1, window.innerWidth / 2)
      const demiHauteur = Math.max(1, window.innerHeight / 2)
      engine.setLook(
        lookTarget({
          nx: pointer ? clamp((pointer.x - (box.left + box.width / 2)) / demiLargeur, -1, 1) : 0,
          ny: pointer ? clamp((pointer.y - (box.top + box.height / 2)) / demiHauteur, -1, 1) : 0,
          tour: easings.easeOutQuint(clamp((clockRef.current - turnSinceRef.current) / TURN_TIME)),
          pointer: pointer !== null,
        }),
        clockRef.current,
      )
      aimingRef.current = true
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    const onPointerLeave = () => {
      pointerRef.current = null
    }

    if (follow) {
      window.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerleave', onPointerLeave)
    }

    let raf = 0
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick)
      const dt = lastMsRef.current ? Math.min((ms - lastMsRef.current) / 1000, 0.064) : 0
      lastMsRef.current = ms
      clockRef.current += dt

      if (playing && plan.blocks.length > 1) {
        if (clockRef.current >= nextAtRef.current && plan.blocks.length) {
          const next = (blockIndexRef.current + 1) % plan.blocks.length
          blockIndexRef.current = next
          applyBlock(next)
        }
      }

      if (follow) aim()
      else releaseLook()

      const engine = engineRef.current
      if (engine) setFrame(engine.sample(clockRef.current))
    }

    applyBlock(blockIndexRef.current)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      releaseLook()
    }
  }, [follow, plan, playing, reducedMotion])

  const rootClass = [styles.root, className].filter(Boolean).join(' ')

  return (
    <svg
      ref={svgRef}
      className={rootClass}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={ariaLabel}
      data-mascot-state={activeState}
      data-mascot-preset={preset ?? ''}
      style={style}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-VB}
          y={-VB}
          width={VB * 2}
          height={VB * 2}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path
              key={i}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
          ))}
          {frame.notch ? (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          ) : null}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop
                key={i}
                offset={i / Math.max(1, arc.grad.stops.length - 1)}
                stopColor={c}
              />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={resolveArcStrokeWidth(arc.width, size)}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {frame.dotsBehind
        ? frame.dots.map((dot, i) => <MascotDot key={`pb${i}`} dot={dot} ink={ink} paper={paper} R={R} />)
        : null}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {!frame.dotsBehind
        ? frame.dots.map((dot, i) => <MascotDot key={`pf${i}`} dot={dot} ink={ink} paper={paper} R={R} />)
        : null}

      {frame.notif ? (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      ) : null}

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={resolveArcStrokeWidth(arc.width, size)}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  )
}

function MascotDot({
  dot,
  ink,
  paper,
  R,
}: {
  dot: BotFrame['dots'][number]
  ink: string
  paper: string
  R: number
}) {
  const fill =
    dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth))
  if (dot.d) {
    return (
      <path
        d={dot.d}
        fill={fill}
        opacity={dot.opacity}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
      />
    )
  }
  return <circle cx={dot.x} cy={dot.y} r={dot.r} fill={fill} opacity={dot.opacity} />
}
