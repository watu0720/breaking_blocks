/**
 * 詳細設計のデータモデル（DTO）に対応する型の再エクスポート。
 * GameState / Item は実行時オブジェクトとして Phaser / RunScene 内で保持。
 */
export type { DifficultyKey } from '@/game/DifficultyProfile';
export type { HighScoreEntry } from '@/game/highscores';
export type { GameSettings, KeyBindingCodes } from '@/game/settingsStore';
export type { UiLanguage } from '@/game/uiI18n';
