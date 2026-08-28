/**
 * Debug logging. SSoT for vibe-gate debug output (DRY).
 */

import { DEBUG_LOG_PREFIX, ENV_KEYS } from '@/constants'

export function debugLog(message: string): void {
  if (process.env[ENV_KEYS.DEBUG]) console.error(`${DEBUG_LOG_PREFIX} ${message}`)
}
