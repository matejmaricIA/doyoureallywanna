import { DEFAULT_THEME, isTheme } from './themes.js';

/**
 * @typedef {object} Settings
 * @property {number} graceMinutes      After "Yes", don't ask again in that tab for this long.
 * @property {number} countdownSeconds  After "No", close the tab after this many seconds.
 * @property {string} theme             Color theme, a key from themes.js.
 * @property {boolean} suggestions      Notice sites opened out of habit and suggest them (opt-in, D-020).
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  graceMinutes: 5,
  countdownSeconds: 5,
  theme: DEFAULT_THEME,
  suggestions: false,
});

export const LIMITS = Object.freeze({
  graceMinutes: { min: 1, max: 120 },
  countdownSeconds: { min: 0, max: 30 },
});

/**
 * Fill in defaults and clamp anything out of range. Never throws.
 * @param {unknown} value
 * @returns {Settings}
 */
export function sanitizeSettings(value) {
  const input = value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
  return {
    graceMinutes: clampInt(input.graceMinutes, LIMITS.graceMinutes, DEFAULT_SETTINGS.graceMinutes),
    countdownSeconds: clampInt(input.countdownSeconds, LIMITS.countdownSeconds, DEFAULT_SETTINGS.countdownSeconds),
    theme: isTheme(input.theme) ? input.theme : DEFAULT_THEME,
    suggestions: input.suggestions === true,
  };
}

/**
 * @param {unknown} value
 * @param {{ min: number, max: number }} range
 * @param {number} fallback
 */
function clampInt(value, { min, max }, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
