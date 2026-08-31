export { Mascot, type MascotProps, type MascotPreset, type MascotStateId } from './Mascot'
export {
  ChatWorkingMascot,
  CHAT_WORKING_MASCOT_SIZE,
  type ChatWorkingMascotProps,
  type ChatWorkingBeatMode,
  type ChatWorkingActiveBeat,
} from './chat-working-mascot'
export {
  beatAt,
  beatsInLoop,
  sampleChatWorkingPose,
  CHAT_WORKING_BEATS,
  CHAT_WORKING_LOOP_BEATS,
  CHAT_WORKING_LOOP_MS,
  CHAT_WORKING_SOLO_MS,
  type ChatWorkingBeat,
} from './chat-working-motion'
export {
  MASCOT_PRESET_RESOLUTION,
  resolveMascotPlayback,
  isMascotStateId,
} from './mascot-presets'
