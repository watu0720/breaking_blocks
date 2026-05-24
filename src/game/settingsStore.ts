import type { DifficultyKey } from '@/game/DifficultyProfile';
import type { UiLanguage } from '@/game/uiI18n';
import { normalizeUiLanguage } from '@/game/uiI18n';

export interface KeyBindingCodes {
  /** KeyboardEvent.code */
  left: string;
  right: string;
  pause: string;
  skill: string;
}

export interface GameSettings {
  motionReduced: boolean;
  language: UiLanguage;
  keys: KeyBindingCodes;
  lastDifficulty: DifficultyKey;
}

export const SETTINGS_STORAGE_KEY = 'breaking-blocks-settings-v1';

export const DEFAULT_KEY_BINDINGS: KeyBindingCodes = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  pause: 'Escape',
  skill: 'Space',
};

export const DEFAULT_SETTINGS: GameSettings = {
  motionReduced: false,
  language: 'ja',
  keys: { ...DEFAULT_KEY_BINDINGS },
  lastDifficulty: 'normal',
};

export function normalizeSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, keys: { ...d.keys } };

  const keysIn =
    raw.keys && typeof raw.keys === 'object'
      ? (raw.keys as Partial<KeyBindingCodes>)
      : ({} as Partial<KeyBindingCodes>);
  const keys: KeyBindingCodes = {
    left: typeof keysIn.left === 'string' ? keysIn.left : d.keys.left,
    right: typeof keysIn.right === 'string' ? keysIn.right : d.keys.right,
    pause: typeof keysIn.pause === 'string' ? keysIn.pause : d.keys.pause,
    skill: typeof keysIn.skill === 'string' ? keysIn.skill : d.keys.skill,
  };

  const lastDifficulty =
    raw.lastDifficulty && typeof raw.lastDifficulty === 'string'
      ? (raw.lastDifficulty as DifficultyKey)
      : d.lastDifficulty;

  return {
    motionReduced: Boolean(raw.motionReduced),
    language: normalizeUiLanguage(raw.language as string | undefined),
    keys,
    lastDifficulty:
      ['easy', 'normal', 'hard', 'veryHard', 'extreme'].includes(lastDifficulty as string)
        ? (lastDifficulty as DifficultyKey)
        : 'normal',
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return normalizeSettings(null);
    return normalizeSettings(JSON.parse(raw) as Partial<GameSettings>);
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** DOM（タイトル UI）へモーションなどを反映（テーマ／拡大／明るさは固定） */
export function applySettingsToDocument(s: GameSettings): void {
  const root = document.documentElement;
  root.dataset.motion = s.motionReduced ? 'reduce' : 'normal';
  root.dataset.theme = 'light';
  root.dataset.contrast = 'normal';
  root.style.setProperty('--ui-scale', '1');
  root.style.setProperty('--ui-brightness', '1');
}

export function settingsEqual(a: GameSettings, b: GameSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** キー割り当てに重複があれば該当 code の配列を返す */
export function validateKeyBindings(keys: KeyBindingCodes): string[] | null {
  const codes = [keys.left, keys.right, keys.pause, keys.skill];
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) dups.add(c);
    seen.add(c);
  }
  return dups.size > 0 ? [...dups] : null;
}
