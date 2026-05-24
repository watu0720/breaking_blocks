import type { DifficultyKey } from '@/game/DifficultyProfile';

export interface HighScoreEntry {
  difficulty: DifficultyKey;
  score: number;
  wave: number;
  comboMax: number;
  survivedMs: number;
  date: string;
}

const STORAGE_KEY = 'breaking-blocks-highscores-v1';
const MAX_ENTRIES = 20;

function loadRaw(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HighScoreEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadHighScores(): HighScoreEntry[] {
  return loadRaw()
    .filter((e) => typeof e.score === 'number')
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

export function saveHighScore(entry: HighScoreEntry): { rank: number; isTop: boolean } {
  const list = loadRaw();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  const rank = trimmed.findIndex((e) => e.date === entry.date && e.score === entry.score) + 1;
  return { rank: rank || trimmed.length, isTop: rank === 1 };
}

export function topScoresPreview(count = 3): HighScoreEntry[] {
  return loadHighScores().slice(0, count);
}
