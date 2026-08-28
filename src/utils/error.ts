/**
 * Error utilities. SSoT for error message extraction (DRY).
 */

/** Extract human-readable message from unknown error. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
