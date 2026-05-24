export type DifficultyKey = 'easy' | 'normal' | 'hard' | 'veryHard' | 'extreme';

export interface DifficultyParams {
  ballSpeedMul: number;
  paddleWidthMul: number;
  densityMul: number;
  labelJa: string;
  labelEn: string;
}

export const DIFFICULTIES: Record<DifficultyKey, DifficultyParams> = {
  easy: {
    ballSpeedMul: 0.9,
    paddleWidthMul: 1.15,
    densityMul: 0.9,
    labelJa: 'はじめて向け',
    labelEn: 'EASY',
  },
  normal: {
    ballSpeedMul: 1,
    paddleWidthMul: 1,
    densityMul: 1,
    labelJa: '標準',
    labelEn: 'NORMAL',
  },
  hard: {
    ballSpeedMul: 1.1,
    paddleWidthMul: 0.95,
    densityMul: 1.05,
    labelJa: '要慣れ',
    labelEn: 'HARD',
  },
  veryHard: {
    ballSpeedMul: 1.18,
    paddleWidthMul: 0.9,
    densityMul: 1.1,
    labelJa: '高難度',
    labelEn: 'VERY HARD',
  },
  extreme: {
    ballSpeedMul: 1.28,
    paddleWidthMul: 0.85,
    densityMul: 1.15,
    labelJa: '極限',
    labelEn: 'EXTREME',
  },
};

export function parseDifficulty(key: string | undefined): DifficultyKey {
  if (key && key in DIFFICULTIES) return key as DifficultyKey;
  return 'normal';
}
