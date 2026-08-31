/**
 * Chat-working multi-beat motion (recording replica).
 * Pure functions — no DOM. Supports holdable audit clips + full loop.
 */

/** Holdable / loop modes exposed on ChatWorkingMascot. */
export type ChatWorkingBeatMode =
  | 'look'
  | 'blink'
  | 'squash'
  | 'flip'
  | 'halo'
  | 'trails'
  | 'loop'

/** Active clip written to `data-mascot-beat` (never `loop`). */
export type ChatWorkingActiveBeat =
  | 'look'
  | 'blink'
  | 'squash'
  | 'flip'
  | 'halo'
  | 'trails'
  | 'rest'

/** Full chat loop sequence (blink lives inside `look` via eyeSy). */
export const CHAT_WORKING_LOOP_BEATS: ReadonlyArray<{
  id: Exclude<ChatWorkingActiveBeat, 'blink' | 'trails'>
  duration: number
}> = [
  { id: 'look', duration: 2200 },
  { id: 'squash', duration: 500 },
  { id: 'flip', duration: 900 },
  { id: 'halo', duration: 2000 },
  { id: 'rest', duration: 1200 },
] as const

/** Solo-clip durations when holding one beat for audit. */
export const CHAT_WORKING_SOLO_MS: Record<
  Exclude<ChatWorkingBeatMode, 'loop'>,
  number
> = {
  look: 2200,
  blink: 1600,
  squash: 900,
  flip: 1200,
  halo: 2000,
  trails: 1600,
}

export const CHAT_WORKING_LOOP_MS = CHAT_WORKING_LOOP_BEATS.reduce(
  (sum, b) => sum + b.duration,
  0,
)

/** @deprecated alias — prefer CHAT_WORKING_LOOP_BEATS */
export const CHAT_WORKING_BEATS = CHAT_WORKING_LOOP_BEATS

/** Original CAP timing (ms). */
export const CAP = {
  anticipate: 80,
  flip: 400,
  recover: 120,
  action: 600,
  gazePeriod: 5400,
  blinkPeriod: 4800,
} as const

const GAZE_KEYS: ReadonlyArray<readonly [number, number, number]> = [
  [0.0, 0, 0],
  [0.1, 0, 0],
  [0.16, 0.72, -0.28],
  [0.28, 0.72, -0.28],
  [0.34, -0.48, 0.36],
  [0.48, -0.48, 0.36],
  [0.54, 0.38, 0.12],
  [0.66, 0.38, 0.12],
  [0.72, -0.22, -0.42],
  [0.82, -0.22, -0.42],
  [0.9, 0.08, 0.06],
  [1.0, 0, 0],
]

const GAZE_SCALE = 6.5

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function easeInOutCubic(t: number): number {
  const u = clamp01(t)
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2
}

export function smoothstep(t: number): number {
  const u = clamp01(t)
  return u * u * (3 - 2 * u)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function beatAt(
  timeMs: number,
): { beat: ChatWorkingActiveBeat; localMs: number; u: number } {
  const loop = ((timeMs % CHAT_WORKING_LOOP_MS) + CHAT_WORKING_LOOP_MS) % CHAT_WORKING_LOOP_MS
  let acc = 0
  for (const block of CHAT_WORKING_LOOP_BEATS) {
    const end = acc + block.duration
    if (loop < end) {
      const localMs = loop - acc
      return { beat: block.id, localMs, u: localMs / block.duration }
    }
    acc = end
  }
  const last = CHAT_WORKING_LOOP_BEATS[CHAT_WORKING_LOOP_BEATS.length - 1]!
  return { beat: last.id, localMs: last.duration, u: 1 }
}

function sampleGaze(tMs: number): { x: number; y: number } {
  const p =
    (((tMs % CAP.gazePeriod) + CAP.gazePeriod) % CAP.gazePeriod) / CAP.gazePeriod
  let i = 0
  while (i < GAZE_KEYS.length - 1 && GAZE_KEYS[i + 1]![0] < p) i += 1
  const a = GAZE_KEYS[i]!
  const b = GAZE_KEYS[Math.min(i + 1, GAZE_KEYS.length - 1)]!
  const span = Math.max(1e-6, b[0] - a[0])
  const s = smoothstep((p - a[0]) / span)
  return {
    x: lerp(a[1], b[1], s) * GAZE_SCALE,
    y: lerp(a[2], b[2], s) * GAZE_SCALE,
  }
}

/** Two ~80ms blink squashes around 1080ms and 1320ms of blinkPeriod. */
function sampleBlink(tMs: number): number {
  const p = ((tMs % CAP.blinkPeriod) + CAP.blinkPeriod) % CAP.blinkPeriod
  const pulse = (center: number) => {
    const d = Math.abs(p - center)
    if (d >= 80) return 1
    return lerp(0.12, 1, smoothstep(d / 80))
  }
  return Math.min(pulse(1080), pulse(1320))
}

/** Solo blink audit: denser blinks so the clip is obvious. */
function sampleSoloBlink(localMs: number, periodMs: number): number {
  const p = ((localMs % periodMs) + periodMs) % periodMs
  // Blink centered at 35% and 70% of the solo period
  const pulse = (center: number) => {
    const d = Math.abs(p - center)
    if (d >= 90) return 1
    return lerp(0.12, 1, smoothstep(d / 90))
  }
  return Math.min(pulse(periodMs * 0.35), pulse(periodMs * 0.7))
}

export interface CapsulePose {
  rotate: number
  sx: number
  sy: number
  tx: number
  ty: number
  trail: number
  dash: number
  halo: number
  eyeX: number
  eyeY: number
  eyeSy: number
  bob: number
}

function restPose(eyes: { x: number; y: number }, eyeSy: number, bob = 0): CapsulePose {
  return {
    rotate: 0,
    sx: 1,
    sy: 1,
    tx: 0,
    ty: 0,
    trail: 0,
    dash: 0,
    halo: 0,
    eyeX: eyes.x,
    eyeY: eyes.y,
    eyeSy,
    bob,
  }
}

function anticipatePose(u: number, eyes: { x: number; y: number }, eyeSy: number): CapsulePose {
  const e = u * u
  return {
    rotate: 10 * e,
    sx: 1 + 0.22 * e,
    sy: 1 - 0.28 * e,
    tx: 0,
    ty: 6 * e,
    trail: 0.12 * e,
    dash: 0,
    halo: 0,
    eyeX: eyes.x * 0.35,
    eyeY: eyes.y * 0.35,
    eyeSy,
    bob: 0,
  }
}

function flipPose(u: number, eyes: { x: number; y: number }, eyeSy: number): CapsulePose {
  const e = easeInOutCubic(u)
  const stretch = Math.sin(u * Math.PI)
  return {
    rotate: 10 - 370 * e,
    sx: 1.22 - 0.22 * e - 0.28 * stretch,
    sy: 0.72 + 0.28 * e + 0.28 * stretch,
    tx: 0,
    ty: 6 - 58 * Math.sin(Math.PI * Math.min(1, e * 1.02)),
    trail: Math.sin(u * Math.PI),
    dash: -52 * e,
    halo: 0,
    eyeX: eyes.x * 0.15,
    eyeY: eyes.y * 0.15,
    eyeSy,
    bob: 0,
  }
}

/** Trails-only audit clip: pill stays, left-edge rainbow glow (m_113), slight bob. */
function trailsPose(u: number, eyes: { x: number; y: number }, eyeSy: number): CapsulePose {
  const pulse = 0.55 + 0.45 * Math.sin(u * Math.PI * 2)
  return {
    rotate: Math.sin(u * Math.PI * 2) * 4,
    sx: 1,
    sy: 1,
    tx: 0,
    ty: Math.sin(u * Math.PI * 2) * 2,
    trail: pulse,
    dash: -30 * u,
    halo: 0,
    eyeX: eyes.x * 0.5,
    eyeY: eyes.y * 0.5,
    eyeSy,
    bob: 0,
  }
}

function poseForActiveBeat(
  beat: ChatWorkingActiveBeat,
  u: number,
  gaze: { x: number; y: number },
  eyeSy: number,
): CapsulePose {
  switch (beat) {
    case 'look':
      return restPose(gaze, eyeSy)
    case 'blink':
      return restPose({ x: 0, y: 0 }, eyeSy)
    case 'squash':
      // Ping-pong anticipate so solo hold reads as a repeating squash
      return anticipatePose(u <= 0.5 ? u * 2 : (1 - u) * 2, gaze, eyeSy)
    case 'flip':
      return flipPose(u, gaze, eyeSy)
    case 'halo': {
      const fade = clamp01(u / 0.1) * clamp01((1 - u) / 0.12)
      const bob = Math.sin(u * Math.PI * 2) * 1.4
      return { ...restPose(gaze, eyeSy, bob), halo: Math.max(0.55, fade) }
    }
    case 'trails':
      return trailsPose(u, gaze, eyeSy)
    case 'rest': {
      const gazeFade = lerp(1, 0.2, easeInOutCubic(clamp01((u - 0.45) / 0.55)))
      return restPose({ x: gaze.x * gazeFade, y: gaze.y * gazeFade }, eyeSy)
    }
    default:
      return restPose(gaze, eyeSy)
  }
}

/**
 * Sample pose for a mode.
 * - `loop`: advances through look → squash → flip → halo → rest
 * - other modes: loop that single clip forever
 */
export function sampleChatWorkingPose(
  timeMs: number,
  mode: ChatWorkingBeatMode = 'loop',
): CapsulePose & { beat: ChatWorkingActiveBeat } {
  if (mode === 'loop') {
    const { beat, u } = beatAt(timeMs)
    const gaze = sampleGaze(timeMs)
    const eyeSy = sampleBlink(timeMs)
    return { ...poseForActiveBeat(beat, u, gaze, eyeSy), beat }
  }

  const period = CHAT_WORKING_SOLO_MS[mode]
  const local = ((timeMs % period) + period) % period
  const u = local / period
  const gaze = mode === 'look' ? sampleGaze(timeMs) : sampleGaze(timeMs * 0.35)
  const eyeSy =
    mode === 'blink' ? sampleSoloBlink(local, period) : mode === 'look' ? sampleBlink(timeMs) : 1

  return { ...poseForActiveBeat(mode, u, gaze, eyeSy), beat: mode }
}

export function beatsInLoop(): ChatWorkingActiveBeat[] {
  return CHAT_WORKING_LOOP_BEATS.map((b) => b.id)
}

/** @deprecated use ChatWorkingActiveBeat */
export type ChatWorkingBeat = ChatWorkingActiveBeat
