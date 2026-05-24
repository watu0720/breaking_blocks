import Phaser from 'phaser';
import RunScene from '@/game/scenes/RunScene';
import { DIFFICULTIES, type DifficultyKey } from '@/game/DifficultyProfile';
import {
  applySettingsToDocument,
  loadSettings,
  normalizeSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  validateKeyBindings,
  type GameSettings,
} from '@/game/settingsStore';
import { formatKeyLabel } from '@/game/keyBindings';
import { loadHighScores, saveHighScore, topScoresPreview, type HighScoreEntry } from '@/game/highscores';
import { exportLogsText, logAppEvent } from '@/app/logger';
import {
  applyShellUiLanguage,
  formatDifficultyMeta,
  formatDifficultySummary,
  keyCapturePrompt,
  localeForScores,
  normalizeUiLanguage,
} from '@/game/uiI18n';
import '@/styles/ui.css';

let game: Phaser.Game | null = null;

const bootOverlay = document.getElementById('boot-overlay');

const screenTitle = document.getElementById('screen-title') as HTMLElement;
const screenDifficulty = document.getElementById('screen-difficulty') as HTMLElement;
const screenGame = document.getElementById('screen-game') as HTMLElement;
const gameRoot = document.getElementById('game-root') as HTMLElement;
const titleDiffSummary = document.getElementById('title-diff-summary') as HTMLElement;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnPickDifficulty = document.getElementById('btn-pick-difficulty') as HTMLButtonElement;
const difficultyBack = document.getElementById('difficulty-back') as HTMLButtonElement;
const difficultyStart = document.getElementById('difficulty-start') as HTMLButtonElement;

const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const btnExitApp = document.getElementById('btn-exit-app') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;
const btnHighscoresDetail = document.getElementById('btn-highscores-detail') as HTMLButtonElement;
const diffRows = Array.from(document.querySelectorAll<HTMLButtonElement>('#screen-difficulty .diff-row'));
const diffMetaD = document.getElementById('diff-meta-d') as HTMLElement;
const highscoreList = document.getElementById('highscore-list') as HTMLOListElement;
const highscoreEmpty = document.getElementById('highscore-empty') as HTMLElement;

const overlayPause = document.getElementById('overlay-pause') as HTMLElement;
const overlayQuitConfirm = document.getElementById('overlay-quit-confirm') as HTMLElement;
const overlayResult = document.getElementById('overlay-result') as HTMLElement;
const overlaySettings = document.getElementById('overlay-settings') as HTMLElement;
const overlayHighscores = document.getElementById('overlay-highscores') as HTMLElement;

const pauseResume = document.getElementById('pause-resume') as HTMLButtonElement;
const pauseTitleBtn = document.getElementById('pause-title-btn') as HTMLButtonElement;
const pauseSettingsBtn = document.getElementById('pause-settings-btn') as HTMLButtonElement;
const pauseScore = document.getElementById('pause-score') as HTMLElement;
const pauseWave = document.getElementById('pause-wave') as HTMLElement;
const pauseLives = document.getElementById('pause-lives') as HTMLElement;

const quitCancel = document.getElementById('quit-cancel') as HTMLButtonElement;
const quitConfirm = document.getElementById('quit-confirm') as HTMLButtonElement;

const resultScore = document.getElementById('result-score') as HTMLElement;
const resultWave = document.getElementById('result-wave') as HTMLElement;
const resultCombo = document.getElementById('result-combo') as HTMLElement;
const resultTime = document.getElementById('result-time') as HTMLElement;
const resultNomiss = document.getElementById('result-nomiss') as HTMLElement;
const resultNew = document.getElementById('result-new-record') as HTMLElement;
const resultRetry = document.getElementById('result-retry') as HTMLButtonElement;
const resultHome = document.getElementById('result-home') as HTMLButtonElement;
const resultHighscores = document.getElementById('result-highscores') as HTMLButtonElement;

const highscoresTbody = document.getElementById('highscores-tbody') as HTMLTableSectionElement;
const highscoresTable = document.getElementById('highscores-table') as HTMLTableElement;
const highscoresEmptyFull = document.getElementById('highscores-empty-full') as HTMLElement;
const highscoresClose = document.getElementById('highscores-close') as HTMLButtonElement;

const setMotion = document.getElementById('set-motion') as HTMLInputElement;
const setLang = document.getElementById('set-lang') as HTMLSelectElement;
const settingsKeyError = document.getElementById('settings-key-error') as HTMLElement;
const settingsSave = document.getElementById('settings-save') as HTMLButtonElement;
const settingsCancel = document.getElementById('settings-cancel') as HTMLButtonElement;
const btnExportLogs = document.getElementById('btn-export-logs') as HTMLButtonElement;

const keyLeftBtn = document.getElementById('key-left') as HTMLButtonElement;
const keyRightBtn = document.getElementById('key-right') as HTMLButtonElement;
const keyPauseBtn = document.getElementById('key-pause') as HTMLButtonElement;
const keySkillBtn = document.getElementById('key-skill') as HTMLButtonElement;

const toastApp = document.getElementById('toast-app') as HTMLElement;

let selectedDifficulty: DifficultyKey = 'normal';
let selectedIndex = 1;

let settingsDraft: GameSettings | null = null;
let capturingSlot: keyof GameSettings['keys'] | null = null;

const ORDER: DifficultyKey[] = ['easy', 'normal', 'hard', 'veryHard', 'extreme'];

function formatPlayTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function dismissBootScreen(): void {
  if (!bootOverlay) return;
  bootOverlay.classList.add('boot-done');
  bootOverlay.setAttribute('aria-busy', 'false');
  window.setTimeout(() => bootOverlay.remove(), 400);
}

function showToast(msg: string): void {
  toastApp.textContent = msg;
  toastApp.hidden = false;
  window.setTimeout(() => {
    toastApp.hidden = true;
  }, 4200);
}

function syncGameShellTheme(_s: GameSettings): void {
  gameRoot.dataset.themeShell = 'light';
}

function pushSettingsEverywhere(s: GameSettings): void {
  applySettingsToDocument(s);
  syncGameShellTheme(s);
  game?.registry.set('gameSettings', s);
  window.dispatchEvent(new CustomEvent('breaking-blocks-settings-changed', { detail: s }));
}

function setDifficulty(key: DifficultyKey): void {
  selectedDifficulty = key;
  const lang = loadSettings().language;
  titleDiffSummary.textContent = formatDifficultySummary(lang, key);
  diffMetaD.textContent = formatDifficultyMeta(lang, key);
  diffRows.forEach((btn) => {
    const active = btn.dataset.level === key;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  selectedIndex = ORDER.indexOf(key);
  if (selectedIndex < 0) selectedIndex = 1;

  const merged = normalizeSettings({ ...loadSettings(), lastDifficulty: key });
  saveSettings(merged);
}

function renderHighScores(): void {
  const preview = topScoresPreview(5);
  const lang = loadSettings().language;
  const loc = localeForScores(lang);
  highscoreList.innerHTML = '';
  if (preview.length === 0) {
    highscoreEmpty.hidden = false;
    return;
  }
  highscoreEmpty.hidden = true;
  for (const e of preview) {
    const li = document.createElement('li');
    const d = DIFFICULTIES[e.difficulty];
    const name = lang === 'en' ? d.labelEn : d.labelJa;
    li.innerHTML = `<span class="score-value">${e.score.toLocaleString(loc)}</span>　Wave ${e.wave}　<span class="muted">${name}</span>`;
    highscoreList.appendChild(li);
  }
}

function renderFullHighScores(): void {
  const rows = loadHighScores();
  const lang = loadSettings().language;
  const loc = localeForScores(lang);
  highscoresTbody.innerHTML = '';
  if (rows.length === 0) {
    highscoresEmptyFull.hidden = false;
    highscoresTable.hidden = true;
    return;
  }
  highscoresEmptyFull.hidden = true;
  highscoresTable.hidden = false;
  rows.forEach((e, idx) => {
    const tr = document.createElement('tr');
    const d = DIFFICULTIES[e.difficulty];
    const diffLabel = lang === 'en' ? d.labelEn : d.labelJa;
    const when = new Date(e.date).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
    tr.innerHTML = `<td>${idx + 1}</td><td class="mono">${e.score.toLocaleString(loc)}</td><td class="mono">${e.wave}</td><td>${diffLabel}</td><td>${when}</td>`;
    highscoresTbody.appendChild(tr);
  });
}

function openHighscoresOverlay(): void {
  renderFullHighScores();
  overlayHighscores.hidden = false;
}

function showTitle(): void {
  screenTitle.hidden = false;
  screenDifficulty.hidden = true;
  screenGame.hidden = true;
  btnQuit.hidden = true;
  overlayPause.hidden = true;
  overlayQuitConfirm.hidden = true;
  overlayResult.hidden = true;
  overlaySettings.hidden = true;
  overlayHighscores.hidden = true;
  renderHighScores();
}

function openDifficultyScreen(): void {
  screenTitle.hidden = true;
  screenDifficulty.hidden = false;
}

function closeDifficultyScreen(): void {
  screenDifficulty.hidden = true;
  screenTitle.hidden = false;
}

function launchGame(): void {
  screenTitle.hidden = true;
  screenDifficulty.hidden = true;
  screenGame.hidden = false;
  btnQuit.hidden = false;

  if (!game) {
    const bg = '#f5fbff';
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: gameRoot,
      width: 960,
      height: 600,
      backgroundColor: bg,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
          // 円 vs 静的 AABB のすり抜け・コーナーでの掠りをやや抑える
          overlapBias: 20,
          fixedStep: true,
        },
      },
      scene: [RunScene],
      // Tauri / WebView では visibilitychange で HIDDEN が誤検出され、Phaser が loop を pause することがあるため抑止
      callbacks: {
        postBoot(phGame: Phaser.Game) {
          queueMicrotask(() => {
            const host = phGame as Phaser.Game & { onHidden: () => void };
            phGame.events.off(Phaser.Core.Events.HIDDEN, host.onHidden, phGame);
          });
        },
      },
      // FIT だと canvas 拡縮とポインタ座標がずれ WebView でパドルが動かないことがあるため 1:1 固定
      scale: {
        mode: Phaser.Scale.NONE,
      },
    };
    game = new Phaser.Game(config);
  } else {
    game.canvas.style.backgroundColor = '#f5fbff';
  }

  game.registry.set('difficulty', selectedDifficulty);
  game.registry.set('gameSettings', loadSettings());
  game.scene.stop('RunScene');
  game.scene.start('RunScene');

  window.requestAnimationFrame(() => {
    const canvas = game?.canvas;
    if (!canvas) return;
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
  });
}

function isPlaySessionVisible(): boolean {
  return !screenGame.hidden && overlayResult.hidden;
}

function triggerPauseFromShell(): void {
  const scene = game?.scene.getScene('RunScene') as RunScene | undefined;
  if (!scene?.scene.isActive()) return;
  scene.requestPause();
}

function destroyGame(): void {
  game?.destroy(true);
  game = null;
  gameRoot.innerHTML = '';
}

function openSettings(): void {
  settingsDraft = structuredClone(loadSettings());
  settingsKeyError.hidden = true;
  capturingSlot = null;
  [keyLeftBtn, keyRightBtn, keyPauseBtn, keySkillBtn].forEach((b) => b.classList.remove('is-wait'));

  setMotion.checked = settingsDraft.motionReduced;
  setLang.value = settingsDraft.language;
  refreshKeyCapLabels();
  overlaySettings.hidden = false;
}

function refreshKeyCapLabels(): void {
  if (!settingsDraft) return;
  keyLeftBtn.textContent = formatKeyLabel(settingsDraft.keys.left);
  keyRightBtn.textContent = formatKeyLabel(settingsDraft.keys.right);
  keyPauseBtn.textContent = formatKeyLabel(settingsDraft.keys.pause);
  keySkillBtn.textContent = formatKeyLabel(settingsDraft.keys.skill);
}

function readFormIntoDraft(): GameSettings | null {
  if (!settingsDraft) return null;
  const next: GameSettings = normalizeSettings({
    ...settingsDraft,
    motionReduced: setMotion.checked,
    language: normalizeUiLanguage(setLang.value),
    keys: { ...settingsDraft.keys },
  });
  return next;
}

function commitSettingsSave(): void {
  const next = readFormIntoDraft();
  if (!next) return;
  const dup = validateKeyBindings(next.keys);
  if (dup) {
    settingsKeyError.hidden = false;
    return;
  }
  settingsKeyError.hidden = true;
  saveSettings(next);
  settingsDraft = next;
  pushSettingsEverywhere(next);
  applyShellUiLanguage(next.language);
  renderHighScores();
  setDifficulty(selectedDifficulty);
  logAppEvent('settings_saved', { language: next.language });
  overlaySettings.hidden = true;
  capturingSlot = null;
}

function cancelSettings(): void {
  capturingSlot = null;
  [keyLeftBtn, keyRightBtn, keyPauseBtn, keySkillBtn].forEach((b) => b.classList.remove('is-wait'));
  settingsDraft = null;
  const s = loadSettings();
  setMotion.checked = s.motionReduced;
  setLang.value = s.language;
  overlaySettings.hidden = true;
}

function armCapture(slot: keyof GameSettings['keys']): void {
  if (!settingsDraft) return;
  capturingSlot = slot;
  [keyLeftBtn, keyRightBtn, keyPauseBtn, keySkillBtn].forEach((b) => b.classList.remove('is-wait'));
  const map = { left: keyLeftBtn, right: keyRightBtn, pause: keyPauseBtn, skill: keySkillBtn };
  map[slot].classList.add('is-wait');
  map[slot].textContent = keyCapturePrompt(settingsDraft.language);
}

diffRows.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    selectedIndex = idx;
    setDifficulty(btn.dataset.level as DifficultyKey);
  });
});

btnStart.addEventListener('click', () => launchGame());

btnPickDifficulty.addEventListener('click', () => openDifficultyScreen());

difficultyBack.addEventListener('click', () => closeDifficultyScreen());

difficultyStart.addEventListener('click', () => launchGame());

btnSettings.addEventListener('click', () => openSettings());

btnExitApp.addEventListener('click', () => {
  void (async () => {
    logAppEvent('exit_requested');
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().destroy();
        return;
      }
    } catch (e) {
      console.warn('[breaking-blocks] Tauri window destroy failed', e);
    }
    window.close();
    window.setTimeout(() => {
      showToast(
        loadSettings().language === 'en'
          ? 'If the tab did not close, close it manually in your browser.'
          : 'タブが閉じない場合は、ブラウザでタブを手動で閉じてください。',
      );
    }, 200);
  })();
});

btnHighscoresDetail.addEventListener('click', () => openHighscoresOverlay());

highscoresClose.addEventListener('click', () => {
  overlayHighscores.hidden = true;
});

settingsSave.addEventListener('click', () => commitSettingsSave());

settingsCancel.addEventListener('click', () => cancelSettings());

keyLeftBtn.addEventListener('click', () => armCapture('left'));
keyRightBtn.addEventListener('click', () => armCapture('right'));
keyPauseBtn.addEventListener('click', () => armCapture('pause'));
keySkillBtn.addEventListener('click', () => armCapture('skill'));

btnExportLogs.addEventListener('click', () => {
  const blob = new Blob([exportLogsText()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `breaking-blocks-log-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  logAppEvent('logs_exported');
});

btnQuit.addEventListener('click', () => {
  destroyGame();
  showTitle();
});

pauseResume.addEventListener('click', () => {
  overlayPause.hidden = true;
  overlayQuitConfirm.hidden = true;
  const scene = game?.scene.getScene('RunScene') as RunScene | undefined;
  scene?.resumeFromUi();
});

pauseSettingsBtn.addEventListener('click', () => openSettings());

pauseTitleBtn.addEventListener('click', () => {
  overlayQuitConfirm.hidden = false;
});

quitCancel.addEventListener('click', () => {
  overlayQuitConfirm.hidden = true;
});

quitConfirm.addEventListener('click', () => {
  overlayQuitConfirm.hidden = true;
  overlayPause.hidden = true;
  destroyGame();
  showTitle();
});

resultHome.addEventListener('click', () => {
  overlayResult.hidden = true;
  destroyGame();
  showTitle();
});

resultRetry.addEventListener('click', () => {
  overlayResult.hidden = true;
  launchGame();
});

resultHighscores.addEventListener('click', () => {
  openHighscoresOverlay();
});

window.addEventListener('breaking-blocks-pause', (ev) => {
  const detail = (ev as CustomEvent).detail as { score: number; wave: number; lives: number } | undefined;
  if (detail) {
    pauseScore.textContent = detail.score.toLocaleString(localeForScores(loadSettings().language));
    pauseWave.textContent = String(detail.wave);
    pauseLives.textContent = String(detail.lives);
  }
  overlayPause.hidden = false;
});

window.addEventListener('breaking-blocks-gameover', (ev) => {
  const detail = (ev as CustomEvent).detail as {
    difficulty: DifficultyKey;
    score: number;
    wave: number;
    comboMax: number;
    survivedMs: number;
    missedOnce: boolean;
  };

  const entry: HighScoreEntry = {
    difficulty: detail.difficulty,
    score: Math.floor(detail.score),
    wave: detail.wave,
    comboMax: detail.comboMax,
    survivedMs: detail.survivedMs,
    date: new Date().toISOString(),
  };
  const { isTop } = saveHighScore(entry);

  resultScore.textContent = entry.score.toLocaleString(localeForScores(loadSettings().language));
  resultWave.textContent = String(entry.wave);
  resultCombo.textContent = String(entry.comboMax);
  resultTime.textContent = formatPlayTime(entry.survivedMs);
  resultNomiss.hidden = detail.missedOnce;
  resultNew.hidden = !isTop;
  overlayResult.hidden = false;

  renderHighScores();
  logAppEvent('game_over', { wave: entry.wave, score: entry.score });
});

document.addEventListener(
  'keydown',
  (e) => {
    if (capturingSlot && !overlaySettings.hidden && settingsDraft) {
      e.preventDefault();
      e.stopPropagation();
      settingsDraft.keys[capturingSlot] = e.code;
      capturingSlot = null;
      [keyLeftBtn, keyRightBtn, keyPauseBtn, keySkillBtn].forEach((b) => b.classList.remove('is-wait'));
      refreshKeyCapLabels();
      return;
    }

    if (!overlaySettings.hidden) return;

    // ゲーム中は矢印・Space・Esc のブラウザ既定動作（スクロール等）が Phaser と競合するため抑止
    if (!screenGame.hidden) {
      const block = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Escape'];
      if (block.includes(e.key)) {
        e.preventDefault();
      }
    }

    if (isPlaySessionVisible()) {
      const pauseCode = loadSettings().keys.pause;
      if (e.code === pauseCode || e.code === 'Escape') {
        e.preventDefault();
        if (!overlayPause.hidden) {
          if (!overlayQuitConfirm.hidden) {
            overlayQuitConfirm.hidden = true;
          } else {
            pauseResume.click();
          }
        } else if (overlayQuitConfirm.hidden) {
          triggerPauseFromShell();
        }
        return;
      }
    }

    if (!screenDifficulty.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        selectedIndex = (selectedIndex + delta + diffRows.length) % diffRows.length;
        const key = diffRows[selectedIndex].dataset.level as DifficultyKey;
        setDifficulty(key);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        launchGame();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDifficultyScreen();
      }
      return;
    }

    if (!screenTitle.hidden && (e.key === 'Enter' || e.key === ' ')) {
      if (e.key === ' ') e.preventDefault();
      launchGame();
    }
  },
  true,
);

logAppEvent('boot', { settingsKey: SETTINGS_STORAGE_KEY });

const bootSettings = loadSettings();
applySettingsToDocument(bootSettings);
syncGameShellTheme(bootSettings);
applyShellUiLanguage(bootSettings.language);
setDifficulty(bootSettings.lastDifficulty);

renderHighScores();
showTitle();

requestAnimationFrame(() => {
  window.setTimeout(dismissBootScreen, 380);
});
