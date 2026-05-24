import type { DifficultyKey } from '@/game/DifficultyProfile';
import { DIFFICULTIES } from '@/game/DifficultyProfile';
import type { KeyBindingCodes } from '@/game/settingsStore';
import { formatKeyLabel } from '@/game/keyBindings';

export type UiLanguage = 'ja' | 'en';

const SHELL: Record<UiLanguage, Record<string, string>> = {
  ja: {
    'btn-settings': '設定',
    'btn-exit-app': '終了',
    'btn-quit': 'ゲームをやめる',
    'brand-sub': '画像シルエットを崩し続ける、無限ウェーブ',
    'title-tagline': '— ローグライク型 —',
    'title-menu-label': 'メニュー',
    'btn-pick-difficulty': '難易度を選ぶ',
    'btn-highscores-detail': '一覧を見る',
    'highscore-empty': '記録がありません',
    'hint-bar-a': '難易度は「難易度を選ぶ」から変更',
    'hint-bar-b': 'Enter でゲーム開始',
    'hint-bar-c': 'ゲーム中 Esc で一時停止',
    'boot-msg': '読み込み中…',
    'diff-screen-eyebrow': '難易度選択',
    'difficulty-back': '戻る',
    'pause-title': '一時停止',
    'pause-lead': 'プレイは停止しています。',
    'pause-lbl-score': 'スコア',
    'pause-lbl-wave': 'Wave',
    'pause-lbl-lives': '残機',
    'pause-resume': '再開',
    'pause-settings-btn': '設定',
    'pause-title-btn': 'タイトルへ',
    'quit-confirm-title': 'タイトルへ戻る',
    'quit-confirm-lead':
      'タイトルに戻ると、このプレイは中断されハイスコアに記録されません。よろしいですか？',
    'quit-cancel': 'キャンセル',
    'quit-confirm': 'タイトルへ',
    'result-title': 'GAME OVER',
    'result-lbl-score': '最終スコア',
    'result-lbl-wave': '到達 Wave',
    'result-lbl-combo': '最大コンボ',
    'result-lbl-time': 'プレイ時間',
    'result-nomiss': 'ノーミス達成',
    'result-new-record': 'ハイスコア更新！',
    'result-retry': 'もう一度',
    'result-highscores': 'ハイスコア一覧',
    'result-home': 'タイトルへ',
    'highscores-title': 'ハイスコア一覧',
    'highscores-empty-full': '記録がありません',
    'highscores-th-rank': '順位',
    'highscores-th-score': 'スコア',
    'highscores-th-wave': 'Wave',
    'highscores-th-diff': '難易度',
    'highscores-th-date': '日時',
    'highscores-close': '閉じる',
    'settings-title': '設定',
    'settings-audio-note': '音声（BGM／効果音）は未実装です。',
    'fieldset-access': '操作・アクセシビリティ',
    'set-motion-label': '動きを減らす（演出を短くします）',
    'set-lang-caption': '表示言語',
    'key-bind-heading': 'キー割り当て（ボタンを押してからキーを入力）',
    'key-caption-left': '左移動',
    'key-caption-right': '右移動',
    'key-caption-pause': '一時停止',
    'key-caption-skill': 'スキル',
    'settings-key-error': '同じキーが重複しています。',
    'fieldset-log': 'ログ',
    'log-lead': '直近のイベントをテキストで保存できます（詳細設計のローカルログ方針）。',
    'btn-export-logs': 'ログをエクスポート',
    'settings-cancel': 'キャンセル',
    'settings-save': '保存',
    'pause-stats-aria': '現在の状況',
  },
  en: {
    'btn-settings': 'Settings',
    'btn-exit-app': 'Exit',
    'btn-quit': 'Quit game',
    'brand-sub': 'Endless waves — break silhouette blocks',
    'title-tagline': '— Roguelike style —',
    'title-menu-label': 'Menu',
    'btn-pick-difficulty': 'Choose difficulty',
    'btn-highscores-detail': 'View all',
    'highscore-empty': 'No records yet',
    'hint-bar-a': 'Change difficulty via “Choose difficulty”',
    'hint-bar-b': 'Press Enter to start',
    'hint-bar-c': 'Press Esc in-game to pause',
    'boot-msg': 'Loading…',
    'diff-screen-eyebrow': 'Difficulty',
    'difficulty-back': 'Back',
    'pause-title': 'Paused',
    'pause-lead': 'The game is paused.',
    'pause-lbl-score': 'Score',
    'pause-lbl-wave': 'Wave',
    'pause-lbl-lives': 'Lives',
    'pause-resume': 'Resume',
    'pause-settings-btn': 'Settings',
    'pause-title-btn': 'Title screen',
    'quit-confirm-title': 'Return to title',
    'quit-confirm-lead':
      'Returning to the title will abandon this run and it will not count for high scores. Continue?',
    'quit-cancel': 'Cancel',
    'quit-confirm': 'To title',
    'result-title': 'GAME OVER',
    'result-lbl-score': 'Final score',
    'result-lbl-wave': 'Wave reached',
    'result-lbl-combo': 'Max combo',
    'result-lbl-time': 'Play time',
    'result-nomiss': 'No-miss bonus',
    'result-new-record': 'New high score!',
    'result-retry': 'Retry',
    'result-highscores': 'High scores',
    'result-home': 'Title screen',
    'highscores-title': 'High scores',
    'highscores-empty-full': 'No records',
    'highscores-th-rank': '#',
    'highscores-th-score': 'Score',
    'highscores-th-wave': 'Wave',
    'highscores-th-diff': 'Difficulty',
    'highscores-th-date': 'Date',
    'highscores-close': 'Close',
    'settings-title': 'Settings',
    'settings-audio-note': 'Audio (BGM / SFX) is not implemented yet.',
    'fieldset-access': 'Controls & accessibility',
    'set-motion-label': 'Reduce motion (shorter effects)',
    'set-lang-caption': 'Display language',
    'key-bind-heading': 'Key bindings (click a button, then press a key)',
    'key-caption-left': 'Move left',
    'key-caption-right': 'Move right',
    'key-caption-pause': 'Pause',
    'key-caption-skill': 'Skill',
    'settings-key-error': 'Duplicate key assignments.',
    'fieldset-log': 'Logs',
    'log-lead': 'Export recent events as a text file (local log policy).',
    'btn-export-logs': 'Export log',
    'settings-cancel': 'Cancel',
    'settings-save': 'Save',
    'pause-stats-aria': 'Current stats',
  },
};

/** getElementById で参照する静的文言キー（ボタン内 span は別処理） */
const DOM_IDS = Object.keys(SHELL.ja) as Array<keyof typeof SHELL.ja>;

export function normalizeUiLanguage(raw: string | undefined): UiLanguage {
  return raw === 'en' ? 'en' : 'ja';
}

export function loadBlockImagesFailedMessage(lang: UiLanguage): string {
  return lang === 'en'
    ? 'Failed to load block images.\nCheck your network or files and reload the page.'
    : 'ブロック画像の読み込みに失敗しました。\nネットワークやファイルを確認し、ページを再読み込みしてください。';
}

export function formatDifficultySummary(lang: UiLanguage, key: DifficultyKey): string {
  const p = DIFFICULTIES[key];
  if (lang === 'en') return `Difficulty: ${p.labelEn}`;
  return `現在の難易度: ${p.labelJa}（${p.labelEn}）`;
}

export function formatDifficultyMeta(lang: UiLanguage, key: DifficultyKey): string {
  const p = DIFFICULTIES[key];
  if (lang === 'en') {
    return `Speed ${p.ballSpeedMul.toFixed(2)}× / Paddle ${p.paddleWidthMul.toFixed(2)}× / Density ${p.densityMul.toFixed(2)}×`;
  }
  return `速度 ${p.ballSpeedMul.toFixed(2)}× / パドル幅 ${p.paddleWidthMul.toFixed(2)}× / 密度 ${p.densityMul.toFixed(2)}×`;
}

export function formatWaveTimerLabel(lang: UiLanguage, remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const time = `${mm}:${ss.toString().padStart(2, '0')}`;
  return lang === 'en' ? `TIME ${time}` : `タイム ${time}`;
}

export function wavePanicToast(lang: UiLanguage): string {
  return lang === 'en'
    ? 'HURRY! Angle assist engaged'
    : 'タイム残りわずか！角度補正を強化';
}

export function waveTimeUpToast(lang: UiLanguage): string {
  return lang === 'en' ? "TIME'S UP — Next WAVE" : 'タイムアップ！次の WAVE へ';
}

export function waveHurryBanner(lang: UiLanguage): string {
  return lang === 'en' ? 'HURRY!' : 'いそげ！';
}

export function formatControlsHint(lang: UiLanguage, keys: KeyBindingCodes): string {
  const L = formatKeyLabel(keys.left);
  const R = formatKeyLabel(keys.right);
  const Sk = formatKeyLabel(keys.skill);
  const P = formatKeyLabel(keys.pause);
  if (lang === 'en') {
    return `${L}/${R} move   Click / ↑ to serve   ${Sk} or right-click for skill   ${P} pause`;
  }
  return `${L}/${R} 移動   クリック／↑でサーブ   ${Sk}／右クリックでスキル   ${P} 一時停止`;
}

export function keyCapturePrompt(lang: UiLanguage): string {
  return lang === 'en' ? 'Press a key…' : 'キーを入力…';
}

export function localeForScores(lang: UiLanguage): string {
  return lang === 'en' ? 'en-US' : 'ja-JP';
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function applyShellUiLanguage(lang: UiLanguage): void {
  document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
  const dict = SHELL[lang];

  for (const id of DOM_IDS) {
    setText(id, dict[id]);
  }

  const btnStartText = document.querySelector('#btn-start .btn-neon-start-text');
  if (btnStartText) {
    btnStartText.textContent = lang === 'en' ? 'Start game' : 'ゲーム開始';
  }

  const diffStartText = document.querySelector('#difficulty-start .btn-neon-start-text');
  if (diffStartText) {
    diffStartText.textContent = lang === 'en' ? 'Start at this difficulty' : 'この難易度で開始';
  }

  document.querySelectorAll<HTMLElement>('[data-diff-level]').forEach((el) => {
    const level = el.dataset.diffLevel as DifficultyKey;
    el.textContent = lang === 'en' ? DIFFICULTIES[level].labelEn : DIFFICULTIES[level].labelJa;
  });

  const pauseStats = document.getElementById('pause-stats');
  if (pauseStats) pauseStats.setAttribute('aria-label', dict['pause-stats-aria']);

  const exitBtn = document.getElementById('btn-exit-app');
  if (exitBtn) {
    if (lang === 'en') exitBtn.setAttribute('title', 'Close the app / tab');
    else exitBtn.setAttribute('title', 'アプリ／タブを閉じます');
  }
}
