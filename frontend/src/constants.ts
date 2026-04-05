/**
 * Shared constants used across components.
 * Kept in one place so a branding tweak updates every consumer.
 */

/** Colours assigned to saved accounts in the switcher, sidebar avatar,
 *  and unified-inbox per-message dot. Same order everywhere. */
export const ACCOUNT_COLORS = [
  '#F5C400', // brand yellow
  '#38bdf8', // cyan
  '#22c55e', // green
  '#ef4444', // red
  '#a78bfa', // purple
  '#fb923c', // orange
] as const

/** Look up an account's palette colour by its index in the saved list. */
export function accountColorFor(index: number): string {
  if (index < 0) index = 0
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]
}
