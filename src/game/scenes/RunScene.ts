import Phaser from 'phaser';
import { DIFFICULTIES, parseDifficulty, type DifficultyKey } from '@/game/DifficultyProfile';
import { codeToPhaserKeyCode } from '@/game/keyBindings';
import { generateBricksFromSilhouette, type BrickKind } from '@/game/ImageStageGenerator';
import { normalizeSettings, type GameSettings } from '@/game/settingsStore';
import {
  formatControlsHint,
  formatWaveTimerLabel,
  loadBlockImagesFailedMessage,
  waveHurryBanner,
  wavePanicToast,
  waveTimeUpToast,
} from '@/game/uiI18n';

type DropKind =
  | 'paddleWide'
  | 'paddleNarrow'
  | 'multiBall'
  | 'multiBall3'
  | 'multiBall5'
  | 'multiBallDouble'
  | 'ballFast'
  | 'ballSlow'
  | 'timeExtend';

type EffectKey = 'paddleWide' | 'paddleNarrow' | 'ballFast' | 'ballSlow' | 'skillSlow';

interface EffectMeta {
  label: string;
  description: string;
  color: number;
  isBuff: boolean;
  /** 効果の持続時間（ms）。HUD のタイマー総量・付与時の延長量・スキル持続にも使う。 */
  durationMs: number;
}

interface DropMeta {
  /** 中央に大きく表示するアイコン文字（Unicode） */
  icon: string;
  /** チップ下に出す短い日本語ラベル */
  label: string;
  /** 背景色（HEX 数値） */
  color: number;
  /** バフ＝true、デバフ＝false。チップ上部のマーカー色／矢印に使用 */
  isBuff: boolean;
}

/**
 * ドロップアイテムの見た目。色付きの四角ではなくアイコン＋ラベル＋上下矢印で
 * バフ／デバフを一目で判別できるようにする。
 */
const DROP_META: Record<DropKind, DropMeta> = {
  paddleWide: { icon: '↔', label: '拡大', color: 0x22c55e, isBuff: true },
  paddleNarrow: { icon: '><', label: '縮小', color: 0xf97316, isBuff: false },
  multiBall: { icon: '●●', label: '＋2 球', color: 0xa855f7, isBuff: true },
  multiBall3: { icon: '●●●', label: '＋3 球', color: 0x9333ea, isBuff: true },
  multiBall5: { icon: '＋5', label: '＋5 球', color: 0x7c3aed, isBuff: true },
  multiBallDouble: { icon: '×2', label: '×2 球', color: 0xc084fc, isBuff: true },
  ballFast: { icon: '≫', label: '加速', color: 0xef4444, isBuff: false },
  ballSlow: { icon: '≪', label: '減速', color: 0x38bdf8, isBuff: true },
  timeExtend: { icon: '⏱+', label: '延長', color: 0x14b8a6, isBuff: true },
};

const EFFECT_META: Record<EffectKey, EffectMeta> = {
  paddleWide: {
    label: 'パドル拡大',
    description: 'パドルが大きくなる',
    color: 0x16a34a,
    isBuff: true,
    durationMs: 15_000,
  },
  paddleNarrow: {
    label: 'パドル縮小',
    description: 'パドルが小さくなる',
    color: 0xea580c,
    isBuff: false,
    durationMs: 7_000,
  },
  ballSlow: {
    label: 'ボール減速',
    description: 'ボール速度が下がる',
    color: 0x0284c7,
    isBuff: true,
    durationMs: 12_000,
  },
  ballFast: {
    label: 'ボール加速',
    description: 'ボール速度が上がる',
    color: 0xdc2626,
    isBuff: false,
    durationMs: 6_500,
  },
  skillSlow: {
    label: 'スローモーション',
    description: 'スキル発動中',
    color: 0x9333ea,
    isBuff: true,
    durationMs: 6_500,
  },
};

interface GameStats {
  difficulty: DifficultyKey;
  score: number;
  wave: number;
  combo: number;
  comboMax: number;
  survivedMs: number;
  missedOnce: boolean;
}

export default class RunScene extends Phaser.Scene {
  private difficultyKey: DifficultyKey = 'normal';
  private params = DIFFICULTIES.normal;

  private rng!: Phaser.Math.RandomDataGenerator;
  private paddle!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
  /** 静的ブロックは StaticGroup を使わないと球との衝突が安定しない */
  private staticBricks!: Phaser.Physics.Arcade.StaticGroup;
  /** 横移動ブロックのみ Dynamic Body */
  private movingBricks!: Phaser.Physics.Arcade.Group;
  private balls!: Phaser.Physics.Arcade.Group;
  private drops!: Phaser.Physics.Arcade.Group;
  private movingBrickTweens: Phaser.Tweens.Tween[] = [];

  private paddleBaseWidth = 118;
  private ballBaseSpeed = 315;

  private wave = 1;
  private lives = 3;
  private stats: GameStats = this.initialStats();

  private comboChain = 0;
  private comboExpireAt = 0;
  private skillGauge = 0;

  private slowMoUntil = 0;
  private skillSpeedScale = 1;

  private effectWideUntil = 0;
  private effectNarrowUntil = 0;
  private effectFastUntil = 0;
  private effectSlowUntil = 0;

  private statsStartTime = 0;

  private hudScore!: Phaser.GameObjects.Text;
  private hudWave!: Phaser.GameObjects.Text;
  private hudLives!: Phaser.GameObjects.Text;
  private hudCombo!: Phaser.GameObjects.Text;
  private hudMaxCombo!: Phaser.GameObjects.Text;
  private hudEffects!: Phaser.GameObjects.Text;
  private hudGauge!: Phaser.GameObjects.Rectangle;
  private hudGaugeFill!: Phaser.GameObjects.Rectangle;
  private hudWaveTimer!: Phaser.GameObjects.Text;
  private hurryBanner?: Phaser.GameObjects.Text;
  private hintLine!: Phaser.GameObjects.Text;

  /** プレイ画面左下に出るエフェクトチップ。EffectKey ごとに表示要素を保持 */
  private effectChips: Map<EffectKey, {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    timerBg: Phaser.GameObjects.Rectangle;
    timerFill: Phaser.GameObjects.Rectangle;
  }> = new Map();

  private pausedByUi = false;
  private bootFailed = false;

  private gameSettings!: GameSettings;
  private keyLeft?: Phaser.Input.Keyboard.Key;
  private keyRight?: Phaser.Input.Keyboard.Key;
  private keyPause?: Phaser.Input.Keyboard.Key;
  private keySkill?: Phaser.Input.Keyboard.Key;
  /** サーブ用（固定で ↑。設定キーとバッティングしにくい） */
  private keyServeUp?: Phaser.Input.Keyboard.Key;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  /** パドル付近で待機中。クリック／↑／スキルキーで初速を与えて発射 */
  private awaitingServe = false;
  /** 再投入待ち（delayedCall 後に解除）。セーフティネット二重発火防止 */
  private respawnPending = false;

  /** WAVE 開始前のカウントダウン中。true の間はボールをパドル上に固定し物理動作を抑止 */
  private waveCountdownActive = false;
  /** カウントダウンが終了する時刻（this.time.now ベース、ms） */
  private waveCountdownEndAt = 0;
  /** 中央に大きく出すカウント用テキスト */
  private waveCountdownText?: Phaser.GameObjects.Text;
  private readonly serveYOffset = 34;
  private readonly ballRadius = 12;
  /** 水平に近すぎる反射を避ける（度数・水平からの最小ずれ） */
  private readonly minBallAngleFromHorizontalDeg = 13;
  /** 同時アクティブなボール数の上限 */
  private readonly maxActiveBalls = 48;
  /** パニック中の水平禁止角（より垂直寄りに矯正してブロック側へ向かわせる） */
  private readonly panicHorizontalMinDeg = 28;
  /** パニック中の垂直禁止角（縦軸往復ループを避けるため最低限の横成分を保証） */
  private readonly panicVerticalMinDeg = 22;

  /** WAVE タイマー：true の間は残り時間を消費する */
  private waveTimerActive = false;
  /** WAVE の制限時間（ms） */
  private readonly waveTimerDurationMs = 60_000;
  /** 残り時間（ms）。0 でタイムアップ */
  private waveTimeRemainingMs = 0;
  /** パニック発動の閾値（残り ms 以下で角度補正強化） */
  private readonly wavePanicThresholdMs = 8_000;
  /** パニックモード中フラグ */
  private wavePanicActive = false;
  /** タイムアップ二重発火防止 */
  private waveTimeUpHandled = false;
  /** 次の WAVE 遷移中フラグ（spawnWave 連打防止） */
  private advancingWave = false;

  /** ポインタ／タッチの X（キー入力と併用。WebView でキーが効きにくいときのフォールバック） */
  private paddleTargetX = 480;

  /** 画面上端〜この Y まで HUD。ワールド境界の上辺（天井）もここ */
  private readonly playfieldTopY = 52;

  /** HUD 下端より下にずらしてブロック群を配置（HUD天井と話す） */
  private readonly brickTopGap = 36;

  /**
   * ポインタ操作のメインハンドラ。
   * - 右クリック：スキル発動（ゲージ満タンなら slowMo、awaitingServe 中ならサーブ代替）
   * - 左クリック：awaitingServe 中はサーブ、それ以外は何もしない
   */
  private readonly onPointerServe = (pointer: Phaser.Input.Pointer): void => {
    if (this.bootFailed || this.pausedByUi) return;
    const isRight =
      (typeof pointer.rightButtonDown === 'function' && pointer.rightButtonDown()) ||
      pointer.button === 2;
    if (isRight) {
      this.tryActivateSkill();
      return;
    }
    if (!this.awaitingServe) return;
    this.releaseAwaitingBall();
  };

  private readonly onExternalSettings = (ev: Event): void => {
    const d = (ev as CustomEvent<GameSettings>).detail;
    if (!d) return;
    this.gameSettings = normalizeSettings(d);
    this.setupKeys(this.gameSettings);
    this.refreshHudTypography();
  };

  constructor() {
    super({ key: 'RunScene' });
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn('[breaking-blocks] loaderror', file.key);
    });
    if (!this.textures.exists('sil1')) {
      this.load.image('sil1', '/assets/blocks/block1.png');
      this.load.image('sil2', '/assets/blocks/block2.png');
      this.load.image('sil3', '/assets/blocks/block3.png');
    }
  }

  create(): void {
    const texKeys = ['sil1', 'sil2', 'sil3'] as const;
    if (!texKeys.every((k) => this.textures.exists(k))) {
      this.bootFailed = true;
      const w = this.scale.width;
      const h = this.scale.height;
      this.add.rectangle(w / 2, h / 2, w, h, 0x1e293b);
      const lang = normalizeSettings(this.registry.get('gameSettings') as Partial<GameSettings> | undefined).language;
      this.add
        .text(
          w / 2,
          h / 2,
          loadBlockImagesFailedMessage(lang),
          {
            align: 'center',
            color: '#f8fafc',
            fontSize: '15px',
            fontFamily: 'system-ui, sans-serif',
            wordWrap: { width: w - 48 },
          },
        )
        .setOrigin(0.5);
      return;
    }

    this.difficultyKey = parseDifficulty(this.registry.get('difficulty') as string | undefined);
    this.params = DIFFICULTIES[this.difficultyKey];
    this.stats = this.initialStats();
    this.stats.difficulty = this.difficultyKey;
    this.statsStartTime = this.time.now;

    // Phaser のシーン restart はインスタンスを使い回すためフィールド初期化が再実行されない。
    // 残機・WAVE・進行系フラグを明示的にリセットしないと前回終了時の状態が残り、
    // ボール落下時に enforceBallOutBottom が早期 return して残機消費・復活が起きない。
    this.lives = 3;
    this.wave = 1;
    this.comboChain = 0;
    this.comboExpireAt = 0;
    this.skillGauge = 0;
    this.slowMoUntil = 0;
    this.effectWideUntil = 0;
    this.effectNarrowUntil = 0;
    this.effectFastUntil = 0;
    this.effectSlowUntil = 0;
    this.awaitingServe = false;
    this.respawnPending = false;
    this.waveCountdownActive = false;
    this.waveCountdownEndAt = 0;
    this.waveTimerActive = false;
    this.waveTimeRemainingMs = this.waveTimerDurationMs;
    this.wavePanicActive = false;
    this.waveTimeUpHandled = false;
    this.advancingWave = false;
    this.bootFailed = false;

    this.gameSettings = normalizeSettings(this.registry.get('gameSettings') as Partial<GameSettings> | undefined);

    this.rng = new Phaser.Math.RandomDataGenerator([
      `${Date.now()}-${this.difficultyKey}-${Math.random()}`,
    ]);

    this.cameras.main.setBackgroundColor(0xf5fbff);

    this.skillSpeedScale = 1;
    this.pausedByUi = false;

    const worldW = this.scale.width;
    const worldH = this.scale.height;

    this.createPlayfieldBackdrop(worldW, worldH);

    this.paddleTargetX = worldW / 2;

    // ポーズ／ゲームオーバー後の再起動などで Arcade ワールドが止まったまま残らないようにする
    this.physics.resume();
    this.physics.world.timeScale = 1;
    this.physics.world.setFPS(120);

    // 左・右・上の壁はワールド境界の反射で処理（下端は開放）。
    // 静的壁との二重処理は円ボディが張り付くため使わない。
    this.physics.world.setBounds(0, this.playfieldTopY, worldW, worldH - this.playfieldTopY);
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.physics.world.checkCollision.down = false;

    this.input.on('pointerdown', () => {
      this.sys.game.canvas?.focus({ preventScroll: true });
    });
    this.input.on('pointerdown', this.onPointerServe);
    // 右クリックをスキル発動に使うため、ブラウザのコンテキストメニューを抑止する
    this.input.mouse?.disableContextMenu();

    this.staticBricks = this.physics.add.staticGroup();
    this.movingBricks = this.physics.add.group();

    this.balls = this.physics.add.group({ runChildUpdate: true });
    // add 時に defaults が collideWorldBounds=false / velocity=0 で個々の Body 設定を上書きするため空にする
    // @ts-expect-error PhysicsGroupDefaults はランタイムで {} 可
    this.balls.defaults = {};
    this.drops = this.physics.add.group();
    // @ts-expect-error 同上：落下速度が消えるのを防ぐ
    this.drops.defaults = {};

    const paddleW = this.paddleBaseWidth * this.params.paddleWidthMul;
    this.paddle = this.add.rectangle(worldW / 2, worldH - 56, paddleW, 16, 0x22d3ee) as unknown as typeof this.paddle;
    this.paddle.setDepth(2500);
    this.physics.add.existing(this.paddle, false);
    this.paddle.body.setCollideWorldBounds(true);
    this.paddle.body.setImmovable(true);
    this.paddle.body.setAllowGravity(false);

    this.setupKeys(this.gameSettings);
    this.cursors = this.input.keyboard?.createCursorKeys();

    /**
     * Group と単体スプライトの組み合わせでは World が collideSpriteVsGroup(sprite, group) とし、
     * コールバック引数は常に (sprite側, groupの子) = (パドル, ボール) の順になる。
     * 第1引数をボールとして扱うとパドルの body に setVelocity してしまいボールが止まる。
     */
    this.physics.add.collider(
      this.balls,
      this.paddle,
      (a, b) => {
        const ball = (a === this.paddle ? b : a) as Phaser.Types.Physics.Arcade.GameObjectWithBody;
        const body = ball.body as Phaser.Physics.Arcade.Body;
        const len = body.velocity.length();
        const speedMul = this.time.now < this.effectFastUntil ? 1.45
          : this.time.now < this.effectSlowUntil ? 0.65
          : 1;
        const spd = Math.max(
          200,
          Math.min(
            680,
            (Number.isFinite(len) ? len : this.ballBaseSpeed) * speedMul,
          ),
        );
        const pos = ball as unknown as Phaser.Types.Math.Vector2Like;
        const dx = pos.x! - this.paddle.x;
        const half = this.paddle.width / 2;
        const n = Phaser.Math.Clamp(dx / half, -1, 1);
        const angle = Phaser.Math.DegToRad(-100 + n * 70);
        body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        // パニック中はパドル反射でも垂直すぎる軌道を避けて残ブロックへ向かわせる
        this.avoidNearlyHorizontalBall(body);
      },
      undefined,
      this,
    );

    const onBallHitBrick: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (o1, o2) =>
      this.handleBrickContact(
        o1 as Phaser.Types.Physics.Arcade.GameObjectWithBody,
        o2 as Phaser.GameObjects.Shape,
      );

    this.physics.add.collider(this.balls, this.staticBricks, onBallHitBrick, undefined, this);
    this.physics.add.collider(this.balls, this.movingBricks, onBallHitBrick, undefined, this);

    /**
     * overlap(drops, paddle) は内部で collideSpriteVsGroup(paddle, drops) となり、
     * コールバックは (パドル, ドロップ) の順。第1引数をドロップとして destroy するとパドルが消えてフリーズする。
     */
    this.physics.add.overlap(this.drops, this.paddle, (o1, o2) => {
      const paddle = this.paddle;
      const drop = (o1 === paddle ? o2 : o2 === paddle ? o1 : null) as
        | (Phaser.GameObjects.GameObject & { destroy: () => void; getData: (k: string) => unknown })
        | null;
      if (!drop) return;
      const kind = drop.getData('kind') as DropKind | undefined;
      drop.destroy();
      if (kind) this.applyDrop(kind);
    });

    const fs = 1;
    this.hudScore = this.add.text(18, 8, '', {
      fontSize: `${15 * fs}px`,
      color: '#0f172a',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudWave = this.add.text(worldW / 2 - 40, 8, '', {
      fontSize: `${15 * fs}px`,
      color: '#0f172a',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudWaveTimer = this.add.text(worldW / 2, 28, '', {
      fontSize: `${13 * fs}px`,
      color: '#0f766e',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    });
    this.hudWaveTimer.setOrigin(0.5, 0);
    this.hudCombo = this.add.text(200, 8, '', {
      fontSize: `${15 * fs}px`,
      color: '#0f766e',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudMaxCombo = this.add.text(340, 8, '', {
      fontSize: `${13 * fs}px`,
      color: '#64748b',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudEffects = this.add.text(18, 30, '', {
      fontSize: `${12 * fs}px`,
      color: '#0f766e',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudEffects.setVisible(false); // 旧テキスト表記はチップに置き換え
    this.hudLives = this.add.text(worldW - 12, 8, '', {
      fontSize: `${15 * fs}px`,
      color: '#b45309',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hudLives.setOrigin(1, 0);

    this.hudGauge = this.add.rectangle(0, 34, 100, 10, 0xdbeafe).setStrokeStyle(1, 0x93c5fd);
    this.hudGaugeFill = this.add.rectangle(0, 34, 0, 8, 0x2563eb).setOrigin(0, 0.5);
    this.layoutSkillGauge(worldW);

    const hintText = formatControlsHint(this.gameSettings.language, this.gameSettings.keys);
    this.hintLine = this.add.text(18, worldH - 22, hintText, {
      fontSize: `${12 * fs}px`,
      color: '#64748b',
      fontFamily: 'system-ui, sans-serif',
    });
    this.hintLine.setOrigin(0, 0.5);

    const hudDepth = 6000;
    [
      this.hudScore,
      this.hudWave,
      this.hudWaveTimer,
      this.hudCombo,
      this.hudMaxCombo,
      this.hudEffects,
      this.hudLives,
      this.hudGauge,
      this.hudGaugeFill,
      this.hintLine,
    ].forEach((obj) => obj.setDepth(hudDepth));

    if (import.meta.env.DEV) {
      this.debugHud = this.add.text(worldW - 12, worldH - 22, '', {
        fontSize: '10px',
        color: '#0f172a',
        backgroundColor: '#fef3c7',
        fontFamily: 'Consolas, monospace',
      });
      this.debugHud.setOrigin(1, 0.5);
      this.debugHud.setDepth(8000);
    }

    // spawnWave 内で refreshHud するため、HUD 生成より後で呼ぶ
    this.spawnWave();

    window.addEventListener('breaking-blocks-settings-changed', this.onExternalSettings);

    // Phaser は scene.postUpdate メソッドを呼ばないため、明示的に POST_UPDATE イベントを購読する。
    // 物理ステップ後に走るので、境界補正・失球判定はここで実施する。
    const postUpdateHandler = (): void => this.onPostUpdate();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, postUpdateHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('breaking-blocks-settings-changed', this.onExternalSettings);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, postUpdateHandler);
      this.input.off('pointerdown', this.onPointerServe);
      for (const chip of this.effectChips.values()) chip.container.destroy(true);
      this.effectChips.clear();
      this.waveCountdownText?.destroy();
      this.waveCountdownText = undefined;
      this.waveCountdownActive = false;
      this.hurryBanner?.destroy();
      this.hurryBanner = undefined;
      this.waveTimerActive = false;
      this.wavePanicActive = false;
      this.debugHud?.destroy();
      this.debugHud = undefined;
    });

    this.applyThemeVisuals();
    this.refreshHud();

    this.time.delayedCall(0, () => {
      const canvas = this.sys.game.canvas;
      if (canvas) {
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'game canvas');
        canvas.focus({ preventScroll: true });
      }
    });
  }

  update(_time: number, delta: number): void {
    if (this.bootFailed) return;
    if (this.pausedByUi) return;

    const worldW = this.scale.width;
    const now = this.time.now;

    if (this.awaitingServe) {
      const ball = this.balls.getFirstAlive(true) as Phaser.GameObjects.Arc | null;
      if (ball?.body) {
        const sy = this.paddle.y - this.serveYOffset;
        ball.setPosition(this.paddle.x, sy);
        const b = ball.body as Phaser.Physics.Arcade.Body;
        b.reset(this.paddle.x, sy);
        b.setVelocity(0, 0);
      }
      const upServe = this.keyServeUp ? Phaser.Input.Keyboard.JustDown(this.keyServeUp) : false;
      if (upServe) this.releaseAwaitingBall();
    }

    // WAVE 開始前カウントダウン処理。
    // 表示テキストの更新と終了判定だけを行い、ボールの停止はカウント開始時に一度だけ実施。
    if (this.waveCountdownActive) {
      const remaining = this.waveCountdownEndAt - now;
      if (this.waveCountdownText) {
        if (remaining > 0) {
          const sec = Math.max(1, Math.ceil(remaining / 1000));
          this.waveCountdownText.setText(String(sec));
          this.waveCountdownText.setColor('#0891b2');
        } else {
          this.waveCountdownText.setText('START!');
          this.waveCountdownText.setColor('#16a34a');
        }
      }

      // ボールが万一動いていてもパドル上に強制固定
      const sy = this.paddle.y - this.serveYOffset;
      this.balls.getChildren().forEach((b) => {
        const ball = b as Phaser.GameObjects.Arc;
        const body = ball.body as Phaser.Physics.Arcade.Body | null;
        if (!body) return;
        body.stop();
        ball.setPosition(this.paddle.x, sy);
        body.reset(this.paddle.x, sy);
      });

      if (remaining <= -420) {
        this.finishWaveCountdown();
      }
    }
    if (now > this.comboExpireAt && this.comboChain > 0) {
      this.comboChain = 0;
      this.stats.combo = 0;
      this.refreshHud();
    }

    if (now < this.slowMoUntil) {
      this.skillSpeedScale = Phaser.Math.Linear(this.skillSpeedScale, 0.55, 0.12);
    } else {
      this.skillSpeedScale = Phaser.Math.Linear(this.skillSpeedScale, 1, 0.15);
    }

    // Phaser Arcade の timeScale は divisor（大きいほど遅い）。
    // skillSpeedScale=0.55 → timeScale=1/0.55≈1.82 で物理を 55% 速度に。
    const effScale =
      now < this.slowMoUntil || this.skillSpeedScale < 0.98 ? this.skillSpeedScale : 1;
    this.physics.world.timeScale = 1 / effScale;

    const wide = now < this.effectWideUntil ? 1.35 : 1;
    const narrow = now < this.effectNarrowUntil ? 0.72 : 1;
    const skillWide = now < this.slowMoUntil ? 1.08 : 1;
    const targetW =
      this.paddleBaseWidth * this.params.paddleWidthMul * wide * narrow * skillWide;
    this.paddle.width = Phaser.Math.Linear(this.paddle.width, targetW, 0.15);
    this.paddle.body.setSize(this.paddle.width, this.paddle.height);

    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    ptr.updateWorldPoint(cam);
    this.paddleTargetX = ptr.worldX;

    const half = this.paddle.width / 2;
    const padMin = half + 4;
    const padMax = worldW - half - 4;
    const step = (560 * delta) / 1000;

    const leftDown = !!(this.keyLeft?.isDown || this.cursors?.left.isDown);
    const rightDown = !!(this.keyRight?.isDown || this.cursors?.right.isDown);
    const usingKeys = leftDown || rightDown;
    let nx = usingKeys ? this.paddle.x : Phaser.Math.Clamp(this.paddleTargetX, padMin, padMax);
    if (leftDown) nx -= step;
    if (rightDown) nx += step;
    nx = Phaser.Math.Clamp(nx, padMin, padMax);

    this.paddle.x = nx;
    const padBody = this.paddle.body as Phaser.Physics.Arcade.Body;
    padBody.reset(nx, this.paddle.y);
    padBody.setVelocity(0, 0);

    if (this.keyPause && Phaser.Input.Keyboard.JustDown(this.keyPause)) {
      this.requestPause();
    }
    if (this.keySkill && Phaser.Input.Keyboard.JustDown(this.keySkill)) {
      this.tryActivateSkill();
    }

    this.drops.getChildren().forEach((d) => {
      const go = d as Phaser.GameObjects.Container;
      if (go.y > this.scale.height + 20) go.destroy();
    });

    this.tickWaveTimer(delta);
    this.updateHudEffects();
    if (import.meta.env.DEV) this.refreshDebugHud();
  }

  /**
   * Phaser.Scene には postUpdate ライフサイクルは存在しない（init / preload / create / update のみ）。
   * このメソッドを定義してもエンジンからは呼ばれないため、後段処理は POST_UPDATE イベントを購読する形で
   * create() からバインドする（this.onPostUpdate）。
   */
  private onPostUpdate(): void {
    if (this.bootFailed || this.pausedByUi) return;
    // 物理ステップ後に境界処理 → その後に失球判定（すり抜け直後の誤消滅を防ぐ）
    this.resolveCourtBounds();
    this.enforceBallOutBottom();
  }

  /**
   * 失球判定の唯一の入り口。
   * 1) 画面下端を越えたボールを破壊する
   * 2) この時点でアクティブなボールが 0 個なら必ず onBallLost を呼ぶ
   *    （destroy 経由でも、何らかの理由でボールが消えていた場合でも残機を必ず消費する）
   */
  private enforceBallOutBottom(): void {
    if (this.awaitingServe) {
      if (import.meta.env.DEV) this.logBallSkip('awaitingServe');
      return;
    }
    if (this.waveCountdownActive) {
      if (import.meta.env.DEV) this.logBallSkip('waveCountdownActive');
      return;
    }
    if (this.respawnPending) {
      if (import.meta.env.DEV) this.logBallSkip('respawnPending');
      return;
    }
    if (this.lives <= 0) {
      if (import.meta.env.DEV) this.logBallSkip('lives<=0');
      return;
    }

    const r = this.ballRadius;
    const h = this.scale.height;

    // destroy() は children を変更するためコピーを走査
    const list = this.balls.getChildren().slice();
    for (const g of list) {
      const ball = g as Phaser.GameObjects.Arc;
      if (!ball.active) continue;
      // 画面下端を少しでも越えたら失球扱い。
      // setBoundsCollision(...,bottom=false) のため bottom はすり抜ける前提。
      if (ball.y + r > h) {
        if (import.meta.env.DEV) console.info('[bb] ball dropped destroy', { y: ball.y, h });
        ball.destroy();
      }
    }

    // ボールが完全に消えていたら必ず失球処理を走らせる。
    // セーフティネットによる「無消費で勝手に再投入」は行わない。
    if (this.activeBallCount() === 0) {
      if (import.meta.env.DEV) console.info('[bb] -> onBallLost', { lives: this.lives });
      this.onBallLost();
    }
  }

  private lastSkipReason = '';
  private debugHud?: Phaser.GameObjects.Text;
  private logBallSkip(reason: string): void {
    if (this.lastSkipReason !== reason) {
      this.lastSkipReason = reason;
      console.info('[bb] enforceBallOutBottom skip:', reason);
    }
  }

  private refreshDebugHud(): void {
    if (!this.debugHud) return;
    const ball = this.balls.getFirst(true) as Phaser.GameObjects.Arc | null;
    const by = ball ? ball.y.toFixed(0) : '-';
    const bvy = ball?.body ? (ball.body as Phaser.Physics.Arcade.Body).velocity.y.toFixed(0) : '-';
    const active = this.activeBallCount();
    const flags = [
      this.awaitingServe ? 'AS' : '',
      this.waveCountdownActive ? 'CD' : '',
      this.respawnPending ? 'RP' : '',
      this.pausedByUi ? 'PU' : '',
    ].filter(Boolean).join('|') || '-';
    this.debugHud.setText(
      `L${this.lives} W${this.wave} balls=${active} y=${by} vy=${bvy} f=${flags} h=${this.scale.height}`,
    );
  }

  /** HUD ・余白・メインプレイの 3 層で、HUD 天井とブロック群を見た目でも分離 */
  private createPlayfieldBackdrop(worldW: number, worldH: number): void {
    const hudH = this.playfieldTopY;
    const gapH = this.brickTopGap;
    const brickTop = this.playfieldTopY + gapH;
    const playRestH = Math.max(0, worldH - brickTop);

    const bandHud = this.add.rectangle(worldW / 2, hudH / 2, worldW, hudH, 0xd8ecfe);
    bandHud.setAlpha(0.94);
    bandHud.setDepth(-610);

    const bandGap = this.add.rectangle(worldW / 2, hudH + gapH / 2, worldW, gapH, 0xeef7ff);
    bandGap.setAlpha(0.98);
    bandGap.setDepth(-605);

    const arena = this.add.rectangle(worldW / 2, brickTop + playRestH / 2, worldW, playRestH, 0xf8fafc);
    arena.setAlpha(1);
    arena.setDepth(-590);

    const ruleHud = this.add.rectangle(worldW / 2, hudH, worldW, 2, 0x0ea5e9);
    ruleHud.setAlpha(0.88);
    ruleHud.setDepth(-583);

    const ruleBricks = this.add.rectangle(worldW / 2, brickTop, worldW - 48, 1, 0xbae6fd);
    ruleBricks.setAlpha(0.72);
    ruleBricks.setDepth(-582);
  }

  /**
   * トンネリング保険：ボール中心がコート外へ明確に出たときだけ反射補正する。
   * 通常の反射は Arcade のワールド境界に任せる（張り付き防止のため blocked は見ない）。
   */
  private resolveCourtBounds(): void {
    if (this.awaitingServe) return;

    const minSpeed = 220;
    const r = this.ballRadius;
    const W = this.scale.width;
    // 境界外に「はっきり」出たときだけ補正（境界ぴったりは触らない）
    const slack = 0.5;
    const xmin = r - slack;
    const xmax = W - r + slack;
    const ymin = this.playfieldTopY + r - slack;

    for (const c of this.balls.getChildren()) {
      const ball = c as Phaser.GameObjects.Arc;
      if (!ball.active || !ball.body) continue;

      const body = ball.body as Phaser.Physics.Arcade.Body;
      const cx = body.center.x;
      const cy = body.center.y;
      let vx = body.velocity.x;
      let vy = body.velocity.y;
      let nx = cx;
      let ny = cy;
      let changed = false;

      if (cx < xmin) {
        nx = r;
        vx = Math.max(Math.abs(vx), minSpeed * 0.45);
        changed = true;
      } else if (cx > xmax) {
        nx = W - r;
        vx = -Math.max(Math.abs(vx), minSpeed * 0.45);
        changed = true;
      }

      if (cy < ymin) {
        ny = this.playfieldTopY + r;
        vy = Math.max(Math.abs(vy), minSpeed * 0.45);
        changed = true;
      }

      if (!changed) continue;

      const spd = Math.hypot(vx, vy);
      if (spd < minSpeed && spd > 0) {
        const f = minSpeed / spd;
        vx *= f;
        vy *= f;
      }

      ball.setPosition(nx, ny);
      body.reset(nx, ny);
      body.setVelocity(vx, vy);
    }
  }

  /**
   * 極端な軌道を避けるための補正。
   * - 通常時：ほぼ水平な反射のみ禁止（minBallAngleFromHorizontalDeg）
   * - パニック中：水平禁止角を強め（panicHorizontalMinDeg）、さらに
   *   ほぼ垂直な軌道（縦軸往復で同じブロックばかり叩いてしまう）も禁止して
   *   タイムアップまでに残ブロックへ到達しやすくする。
   */
  private avoidNearlyHorizontalBall(body: Phaser.Physics.Arcade.Body): void {
    const vx0 = body.velocity.x;
    const vy0 = body.velocity.y;
    const speed = Math.hypot(vx0, vy0);
    if (speed < 72) return;

    const horizMinDeg = this.wavePanicActive
      ? this.panicHorizontalMinDeg
      : this.minBallAngleFromHorizontalDeg;
    const horizMinSin = Math.sin(Phaser.Math.DegToRad(horizMinDeg));
    const vertMinDeg = this.wavePanicActive ? this.panicVerticalMinDeg : 0;
    const vertMinSin = Math.sin(Phaser.Math.DegToRad(vertMinDeg));

    let vx = vx0;
    let vy = vy0;
    let changed = false;

    if (Math.abs(vy) / speed < horizMinSin) {
      const signVy = vy >= 0 ? 1 : -1;
      const signVx = vx >= 0 ? 1 : (vx < 0 ? -1 : (Math.random() < 0.5 ? -1 : 1));
      vy = signVy * speed * horizMinSin;
      const vxMag = Math.sqrt(Math.max(0, speed * speed - vy * vy));
      vx = signVx * vxMag;
      changed = true;
    }

    if (vertMinDeg > 0) {
      const curSpeed = Math.hypot(vx, vy) || speed;
      if (Math.abs(vx) / curSpeed < vertMinSin) {
        const signVx = vx >= 0 ? 1 : (vx < 0 ? -1 : (Math.random() < 0.5 ? -1 : 1));
        const signVy = vy >= 0 ? 1 : -1;
        vx = signVx * curSpeed * vertMinSin;
        const vyMag = Math.sqrt(Math.max(0, curSpeed * curSpeed - vx * vx));
        vy = signVy * vyMag;
        changed = true;
      }
    }

    if (changed) body.setVelocity(vx, vy);
  }

  resumeFromUi(): void {
    this.pausedByUi = false;
    this.physics.resume();
    this.tweens.resumeAll();
    if (this.scene.isPaused()) this.scene.resume();
  }

  pauseFromUi(): void {
    this.pausedByUi = true;
    this.physics.pause();
    this.tweens.pauseAll();
  }

  private initialStats(): GameStats {
    return {
      difficulty: 'normal',
      score: 0,
      wave: 1,
      combo: 0,
      comboMax: 0,
      survivedMs: 0,
      missedOnce: false,
    };
  }

  private layoutSkillGauge(worldW: number): void {
    const margin = 12;
    const barW = 100;
    const cx = worldW - margin - barW / 2;
    const left = cx - barW / 2;
    this.hudGauge.setPosition(cx, 34);
    this.hudGaugeFill.setPosition(left, 34);
    this.hudLives.setPosition(worldW - margin, 8);
  }

  private refreshHud(): void {
    const w = this.scale.width;
    this.hudScore.setText(`SCORE ${this.stats.score.toLocaleString('ja-JP')}`);
    this.hudWave.setText(`WAVE ${this.wave}`);
    this.hudCombo.setText(this.comboChain > 0 ? `COMBO x${1 + Math.min(8, this.comboChain)}` : '');
    this.hudMaxCombo.setText(this.stats.comboMax > 0 ? `MAX ${this.stats.comboMax}` : '');
    this.hudLives.setText(`残機 ${'●'.repeat(this.lives)}${'○'.repeat(Math.max(0, 5 - this.lives))}`);
    const ratio = Phaser.Math.Clamp(this.skillGauge / 100, 0, 1);
    this.hudGaugeFill.width = ratio * 100;
    this.layoutSkillGauge(w);
  }

  private updateHudEffects(): void {
    const now = this.time.now;

    const active: Array<{ key: EffectKey; remaining: number; total: number }> = [];
    const pushIfActive = (key: EffectKey, until: number, total: number): void => {
      if (until > now) active.push({ key, remaining: until - now, total });
    };

    pushIfActive('paddleWide', this.effectWideUntil, EFFECT_META.paddleWide.durationMs);
    pushIfActive('paddleNarrow', this.effectNarrowUntil, EFFECT_META.paddleNarrow.durationMs);
    pushIfActive('ballFast', this.effectFastUntil, EFFECT_META.ballFast.durationMs);
    pushIfActive('ballSlow', this.effectSlowUntil, EFFECT_META.ballSlow.durationMs);
    pushIfActive('skillSlow', this.slowMoUntil, EFFECT_META.skillSlow.durationMs);

    const activeKeys = new Set(active.map((e) => e.key));

    // 期限切れチップを除去
    for (const [key, chip] of this.effectChips) {
      if (!activeKeys.has(key)) {
        chip.container.destroy(true);
        this.effectChips.delete(key);
      }
    }

    // チップを HUD 下の余白帯（playfieldTopY と brickTopGap の間）に水平に並べる。
    // パドル可動エリアと重ならない位置。
    const chipW = 168;
    const chipH = 22;
    const gap = 8;
    const totalW = active.length * chipW + Math.max(0, active.length - 1) * gap;
    const startX = Math.max(8, (this.scale.width - totalW) / 2);
    const cy = this.playfieldTopY + this.brickTopGap / 2;

    active.forEach((e, idx) => {
      const meta = EFFECT_META[e.key];
      const cx = startX + idx * (chipW + gap) + chipW / 2;
      let chip = this.effectChips.get(e.key);

      if (!chip) {
        const container = this.add.container(cx, cy);
        const bg = this.add.rectangle(0, 0, chipW, chipH, meta.color, 0.18);
        bg.setStrokeStyle(1, meta.color, 0.7);
        const label = this.add.text(0, -3, '', {
          fontSize: '11px',
          color: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'bold',
        });
        label.setOrigin(0.5, 0.5);
        const timerBg = this.add.rectangle(0, 7, chipW - 14, 3, 0x000000, 0.12);
        const timerFill = this.add.rectangle(-(chipW - 14) / 2, 7, 0, 3, meta.color, 0.95).setOrigin(0, 0.5);
        container.add([bg, label, timerBg, timerFill]);
        container.setDepth(6100);
        chip = { container, bg, label, timerBg, timerFill };
        this.effectChips.set(e.key, chip);
      } else {
        chip.container.setPosition(cx, cy);
      }

      const secs = Math.max(0, e.remaining / 1000);
      const arrow = meta.isBuff ? '▲' : '▼';
      chip.label.setText(`${arrow} ${meta.label} ${secs.toFixed(1)}s`);
      const ratio = Phaser.Math.Clamp(e.remaining / e.total, 0, 1);
      chip.timerFill.width = (chipW - 14) * ratio;
    });

    // テキスト系（互換用、現在非表示）
    this.hudEffects.setText('');
  }

  /** 効果取得・喪失時のトースト通知（中央上） */
  private showToast(text: string, hexColor: string = '#0f172a', durationMs: number = 1800): void {
    const cx = this.scale.width / 2;
    const cy = this.playfieldTopY + 48;

    const txt = this.add.text(cx, cy, text, {
      fontSize: '18px',
      color: hexColor,
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      backgroundColor: '#ffffffee',
      padding: { left: 14, right: 14, top: 6, bottom: 6 },
    });
    txt.setOrigin(0.5, 0.5);
    txt.setDepth(7000);
    txt.setScrollFactor(0);

    this.tweens.add({
      targets: txt,
      y: cy + 16,
      alpha: { from: 1, to: 0 },
      duration: this.tweenDuration(durationMs),
      ease: 'Cubic.easeIn',
      onComplete: () => txt.destroy(),
    });
  }

  private spawnBall(x: number, y: number, speed?: number, immediate = false): void {
    const ball = this.add.circle(x, y, this.ballRadius, 0xdc2626);
    ball.setDepth(3000);
    this.physics.add.existing(ball as Phaser.Types.Physics.Arcade.GameObjectWithBody);

    // 先にグループへ追加（PhysicsGroup の defaults はここで適用されるため、その後で body を設定する）
    this.balls.add(ball as Phaser.Types.Physics.Arcade.GameObjectWithBody);

    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.ballRadius);
    body.setBounce(1, 1);
    // ワールド境界（左・右・上）で反射させる。下端は setBoundsCollision で開放
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(560, 560);
    body.setAllowGravity(false);

    if (immediate) {
      const spd =
        speed ??
        this.ballBaseSpeed * this.params.ballSpeedMul * (1 + (this.wave - 1) * 0.038);
      const angle = Phaser.Math.FloatBetween(-2.9, -0.55);
      body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
    } else {
      this.awaitingServe = true;
      body.setVelocity(0, 0);
    }
  }

  private releaseAwaitingBall(): void {
    if (!this.awaitingServe) return;
    const ball = this.balls.getFirstAlive(true) as Phaser.GameObjects.Arc | null;
    if (!ball?.body) {
      this.awaitingServe = false;
      return;
    }
    this.awaitingServe = false;
    const body = ball.body as Phaser.Physics.Arcade.Body;
    const spd =
      this.ballBaseSpeed * this.params.ballSpeedMul * (1 + (this.wave - 1) * 0.038);
    const angle = Phaser.Math.FloatBetween(-2.9, -0.55);
    body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
  }

  private spawnWave(): void {
    this.clearBricksAndEffects();
    this.resetWaveTimer();

    const { cols, rows } = this.resolveStageGrid(this.wave);
    const key = this.rng.pick(['sil1', 'sil2', 'sil3']);
    const tex = this.textures.get(key);
    const img = tex.getSourceImage() as HTMLImageElement;

    const brickspec = generateBricksFromSilhouette(img, cols, rows, this.params.densityMul, this.wave, this.rng);

    const marginX = 48;
    const top = this.playfieldTopY + this.brickTopGap;
    const usableW = this.scale.width - marginX * 2;
    const bottomReserve = 210;
    const usableH = Math.max(96, this.scale.height - top - bottomReserve);
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    for (const spec of brickspec) {
      const cx = marginX + spec.gx * cellW + cellW / 2;
      const cy = top + spec.gy * cellH + cellH / 2;

      const tint =
        spec.kind === 'vanishing'
          ? Phaser.Display.Color.ValueToColor(spec.color || 0x64748b).lighten(22).color
          : spec.color || 0x64748b;

      const bw = cellW - 4;
      const bh = cellH - 3;
      let brick: Phaser.GameObjects.Shape;
      const strokeW = spec.kind === 'vanishing' ? 2 : 1;
      const strokeC = spec.kind === 'vanishing' ? 0x7c3aed : 0x1e293b;

      brick = this.add.rectangle(cx, cy, bw, bh, tint);
      brick.setStrokeStyle(strokeW, strokeC, 0.4);

      brick.setData('hp', spec.hp);
      brick.setData('maxHp', spec.hp);
      brick.setData('kind', spec.kind);
      brick.setData('lastDmg', 0);
      brick.setData('moving', spec.kind === 'moving');

      if (spec.kind === 'moving') {
        this.physics.add.existing(brick, false);
        const body = brick.body as Phaser.Physics.Arcade.Body;
        body.setImmovable(true);
        body.setAllowGravity(false);
        body.setVelocity(0, 0);
        // 物理ボディは常に AABB（回転やシェイプに関わらずセルサイズで統一）
        body.setSize(bw, bh);
        body.setOffset((brick.width - bw) / 2, (brick.height - bh) / 2);
        const t = this.tweens.add({
          targets: brick,
          x: cx + Phaser.Math.Between(36, 80) * (this.rng.frac() < 0.5 ? 1 : -1),
          duration: this.tweenDuration(Phaser.Math.Between(1200, 2000)),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            body.reset(brick.x, brick.y);
          },
        });
        this.movingBrickTweens.push(t);
        this.movingBricks.add(brick as Phaser.GameObjects.GameObject & Phaser.Types.Physics.Arcade.GameObjectWithBody);
      } else {
        this.physics.add.existing(brick, true);
        const sBody = brick.body as Phaser.Physics.Arcade.StaticBody;
        sBody.setSize(bw, bh);
        sBody.setOffset((brick.width - bw) / 2, (brick.height - bh) / 2);
        this.staticBricks.add(brick as Phaser.GameObjects.GameObject & Phaser.Types.Physics.Arcade.GameObjectWithBody);
      }

      if (spec.kind === 'durable' && spec.hp > 1) {
        const label = this.add.text(cx, cy, String(spec.hp), {
          fontSize: '11px',
          color: '#fef3c7',
          fontFamily: 'system-ui, sans-serif',
        });
        label.setOrigin(0.5);
        brick.setData('label', label);
      }
    }

    // ボールが残っていない場合はパドル上に生成。カウントダウン中は update() でパドル上に固定される。
    if (this.activeBallCount() === 0) {
      this.spawnBall(this.paddle.x, this.paddle.y - this.serveYOffset, undefined, true);
    }

    this.stats.wave = this.wave;
    this.refreshHud();

    // advancingWave は finishWaveCountdown が呼ばれた時点で解除する
    // （カウントダウン中も tickWaveTimer のスキップ条件で使うため）
    this.startWaveCountdown(3);
  }

  /**
   * WAVE 進行に応じてシルエットのサンプリンググリッド解像度を返す。
   * - WAVE 1：18 × 18（従来のドット感）
   * - WAVE 20：36 × 36（だいぶ細かい・画像の解像度感が出る）
   * - 21 以降は上限 36 で頭打ち
   * - ease-out 気味のカーブで、序盤の進行でも変化を体感しやすくしている
   */
  private resolveStageGrid(wave: number): { cols: number; rows: number } {
    const baseCols = 18;
    const baseRows = 18;
    const peakCols = 36;
    const peakRows = 36;
    const peakAtWave = 20;
    const t = Phaser.Math.Clamp((wave - 1) / (peakAtWave - 1), 0, 1);
    const eased = Math.pow(t, 0.85);
    const cols = Math.round(baseCols + (peakCols - baseCols) * eased);
    const rows = Math.round(baseRows + (peakRows - baseRows) * eased);
    return { cols, rows };
  }

  /** WAVE タイマーを未開始状態にリセット（カウントダウン後に始動する） */
  private resetWaveTimer(): void {
    this.waveTimerActive = false;
    this.waveTimeRemainingMs = this.waveTimerDurationMs;
    this.wavePanicActive = false;
    this.waveTimeUpHandled = false;
    this.hideHurryBanner();
  }

  /** WAVE タイマーを始動する。WAVE 開始カウントダウン終了時に呼ぶ */
  private startWaveTimer(): void {
    this.waveTimerActive = true;
    this.waveTimeRemainingMs = this.waveTimerDurationMs;
    this.wavePanicActive = false;
    this.waveTimeUpHandled = false;
  }

  /**
   * 毎フレーム呼ばれる WAVE タイマー処理。
   * - 一時停止／WAVE 開始カウントダウン／WAVE 遷移中は進行を止める
   * - 残り時間がしきい値以下になったらパニックを発動
   * - 残り時間が 0 になったらタイムアップ → 次の WAVE へ
   */
  private tickWaveTimer(delta: number): void {
    if (!this.waveTimerActive) {
      this.updateWaveTimerHud();
      return;
    }
    if (this.pausedByUi || this.waveCountdownActive || this.advancingWave) {
      this.updateWaveTimerHud();
      return;
    }

    this.waveTimeRemainingMs = Math.max(0, this.waveTimeRemainingMs - delta);

    if (!this.wavePanicActive && this.waveTimeRemainingMs <= this.wavePanicThresholdMs && this.waveTimeRemainingMs > 0) {
      this.activateWavePanic();
    }

    if (this.waveTimeRemainingMs <= 0 && !this.waveTimeUpHandled) {
      this.waveTimeUpHandled = true;
      this.handleWaveTimeUp();
    }

    this.updateWaveTimerHud();
  }

  /** パニックモードを発動する。角度補正の強化と通知の表示。 */
  private activateWavePanic(): void {
    if (this.wavePanicActive) return;
    this.wavePanicActive = true;
    const lang = this.gameSettings?.language ?? 'ja';
    this.showToast(wavePanicToast(lang), '#f59e0b', 1500);
    this.showHurryBanner();
  }

  /** タイムアップ時の処理。残機は減らさず、次の WAVE へ進む。 */
  private handleWaveTimeUp(): void {
    this.waveTimerActive = false;
    const lang = this.gameSettings?.language ?? 'ja';
    this.showToast(waveTimeUpToast(lang), '#f59e0b', 1400);
    this.advanceToNextWave();
  }

  /** HUD のタイマー表示を更新（残り時間・色・点滅） */
  private updateWaveTimerHud(): void {
    if (!this.hudWaveTimer) return;
    const lang = this.gameSettings?.language ?? 'ja';
    const text = formatWaveTimerLabel(lang, this.waveTimeRemainingMs);
    this.hudWaveTimer.setText(text);

    if (!this.waveTimerActive) {
      this.hudWaveTimer.setColor('#94a3b8');
      this.hudWaveTimer.setAlpha(0.85);
      return;
    }

    if (this.wavePanicActive) {
      // 残り時間に応じて 0.5〜1.0 で滑らかに点滅
      const blink = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time.now / 120));
      this.hudWaveTimer.setColor('#dc2626');
      this.hudWaveTimer.setAlpha(blink);
    } else if (this.waveTimeRemainingMs <= 15_000) {
      this.hudWaveTimer.setColor('#ea580c');
      this.hudWaveTimer.setAlpha(1);
    } else {
      this.hudWaveTimer.setColor('#0f766e');
      this.hudWaveTimer.setAlpha(1);
    }
  }

  /** 画面中央寄り上部に「HURRY!」バナーを表示（パニック中） */
  private showHurryBanner(): void {
    if (this.hurryBanner) return;
    const lang = this.gameSettings?.language ?? 'ja';
    const cx = this.scale.width / 2;
    const cy = this.playfieldTopY + this.brickTopGap + 18;
    this.hurryBanner = this.add.text(cx, cy, waveHurryBanner(lang), {
      fontSize: '34px',
      color: '#dc2626',
      fontStyle: 'bold',
      fontFamily: 'system-ui, sans-serif',
      stroke: '#ffffff',
      strokeThickness: 5,
    });
    this.hurryBanner.setOrigin(0.5);
    this.hurryBanner.setDepth(6700);
    this.tweens.add({
      targets: this.hurryBanner,
      scale: { from: 0.6, to: 1.0 },
      alpha: { from: 0, to: 1 },
      duration: this.tweenDuration(260),
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.hurryBanner,
      alpha: { from: 1, to: 0.55 },
      duration: this.tweenDuration(420),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.tweenDuration(260),
    });
  }

  private hideHurryBanner(): void {
    if (!this.hurryBanner) return;
    const banner = this.hurryBanner;
    this.hurryBanner = undefined;
    this.tweens.killTweensOf(banner);
    this.tweens.add({
      targets: banner,
      alpha: 0,
      scale: 0.7,
      duration: this.tweenDuration(180),
      onComplete: () => banner.destroy(),
    });
  }

  /**
   * WAVE 開始前のカウントダウンを開始する。
   * 中央に大きな数字を表示し、カウント中はボールをパドル上に固定する（実処理は update() 側）。
   */
  private startWaveCountdown(seconds = 3): void {
    this.waveCountdownActive = true;
    this.waveCountdownEndAt = this.time.now + seconds * 1000;
    this.awaitingServe = false;

    if (!this.waveCountdownText) {
      this.waveCountdownText = this.add.text(this.scale.width / 2, this.scale.height / 2 - 30, '', {
        fontSize: '120px',
        color: '#0891b2',
        fontStyle: 'bold',
        fontFamily: 'system-ui, sans-serif',
        stroke: '#ffffff',
        strokeThickness: 6,
      });
      this.waveCountdownText.setOrigin(0.5);
      this.waveCountdownText.setDepth(7000);
    }
    this.waveCountdownText.setText(String(seconds));
    this.waveCountdownText.setColor('#0891b2');
    this.waveCountdownText.setAlpha(1);
    this.waveCountdownText.setScale(1);
    this.waveCountdownText.setVisible(true);
  }

  private finishWaveCountdown(): void {
    if (!this.waveCountdownActive) return;
    this.waveCountdownActive = false;
    if (this.waveCountdownText) {
      this.tweens.add({
        targets: this.waveCountdownText,
        alpha: 0,
        scale: 1.4,
        duration: this.tweenDuration(220),
        onComplete: () => this.waveCountdownText?.setVisible(false),
      });
    }

    const baseSpd = this.ballBaseSpeed * this.params.ballSpeedMul * (1 + (this.wave - 1) * 0.038);
    let served = false;
    this.balls.getChildren().forEach((b) => {
      const ball = b as Phaser.GameObjects.Arc;
      const body = ball.body as Phaser.Physics.Arcade.Body | null;
      if (!body) return;
      const angle = Phaser.Math.FloatBetween(-2.6, -0.65);
      body.setVelocity(Math.cos(angle) * baseSpd, Math.sin(angle) * baseSpd);
      served = true;
    });

    if (!served && this.lives > 0) {
      this.spawnBall(this.paddle.x, this.paddle.y - this.serveYOffset, undefined, true);
    }

    // WAVE 開始カウントダウンが終わったらタイマー始動
    this.advancingWave = false;
    this.startWaveTimer();
  }

  private clearBricksAndEffects(): void {
    this.movingBrickTweens.forEach((t) => t.stop());
    this.movingBrickTweens = [];

    // ブロックを破棄する前に紐付く HP ラベル（durable 用）を destroy する。
    // setData('label', ...) は別オブジェクトの参照を持つだけで、ブロック削除時に
    // 自動 destroy されないため、WAVE 切り替え時に数字だけ画面に残ってしまうのを防ぐ。
    const destroyAttachedLabels = (
      group: Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup,
    ): void => {
      group.getChildren().forEach((c) => {
        const label = (c as Phaser.GameObjects.Shape).getData('label') as
          | Phaser.GameObjects.Text
          | undefined;
        label?.destroy();
      });
    };
    destroyAttachedLabels(this.staticBricks);
    destroyAttachedLabels(this.movingBricks);

    this.staticBricks.clear(true, true);
    this.movingBricks.clear(true, true);
  }

  private handleBrickContact(
    ball: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    brick: Phaser.GameObjects.Shape,
  ): void {
    const now = this.time.now;
    if (now - (brick.getData('lastDmg') as number) < 42) return;
    brick.setData('lastDmg', now);

    const body = ball.body as Phaser.Physics.Arcade.Body;

    // 反射方向は Phaser の bounce=1 が既に適用しているため手動反転は行わない。
    // ここでは速度の絶対値ゆらぎと水平すぎる軌道の補正だけ行う。
    const ang = Math.atan2(body.velocity.y, body.velocity.x);
    const len = body.velocity.length();
    const nextLen = Phaser.Math.Clamp(len * Phaser.Math.FloatBetween(0.97, 1.05), 200, 580);
    body.setVelocity(Math.cos(ang) * nextLen, Math.sin(ang) * nextLen);
    this.avoidNearlyHorizontalBall(body);

    let hp = brick.getData('hp') as number;
    hp -= 1;
    brick.setData('hp', hp);

    const label = brick.getData('label') as Phaser.GameObjects.Text | undefined;
    if (label) label.setText(String(Math.max(hp, 1)));

    this.comboChain += 1;
    this.comboExpireAt = now + 2100;
    const mult = 1 + Math.min(8, this.comboChain);
    const basePts = 80 + this.wave * 10;
    this.stats.score += basePts * mult;
    this.stats.combo = this.comboChain;
    this.stats.comboMax = Math.max(this.stats.comboMax, this.comboChain);

    this.skillGauge = Math.min(100, this.skillGauge + 5);
    this.refreshHud();

    if (hp > 0) return;

    const kind = brick.getData('kind') as BrickKind;
    if (kind === 'item') {
      this.spawnDrop(brick.x, brick.y);
    }

    const labelDestroy = brick.getData('label') as Phaser.GameObjects.Text | undefined;
    labelDestroy?.destroy();

    brick.destroy();

    this.checkWaveClear();
  }

  private checkWaveClear(): void {
    if (this.advancingWave) return;
    if (this.staticBricks.countActive(true) === 0 && this.movingBricks.countActive(true) === 0) {
      this.advanceToNextWave();
    }
  }

  /**
   * 次の WAVE へ進む共通ルート。
   * - ブロック全壊（checkWaveClear 経由）／タイムアップ（handleWaveTimeUp 経由）の両方から呼ばれる
   * - 残機は減らさない（ゲームオーバーは onBallLost で残機 0 になったときだけ）
   * - 二重発火を advancingWave で防ぐ
   */
  private advanceToNextWave(): void {
    if (this.advancingWave) return;
    this.advancingWave = true;
    this.waveTimerActive = false;
    this.wavePanicActive = false;
    this.hideHurryBanner();
    this.wave += 1;
    this.spawnWave();
    this.flashWave();
  }

  private flashWave(): void {
    // カウントダウン数字（画面中央）と被らないように、画面上方寄りに「WAVE N」を出す
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 130, `WAVE ${this.wave}`, {
      fontSize: '38px',
      color: '#0891b2',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4,
    });
    t.setOrigin(0.5);
    t.setDepth(6500);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: t.y - 24,
      duration: this.tweenDuration(900),
      onComplete: () => t.destroy(),
    });
  }

  /**
   * ドロップアイテムの種類を重み付きで抽選する。
   * 増球系（multiBall / multiBall3 / multiBall5 / multiBallDouble）の合計比率を
   * 旧来より厚くし、テンポ良くボールが増える体験を狙う。
   * 数字（weight）は合計から逆算した出現割合（％）の目安をコメントに併記。
   */
  private pickDropKind(): DropKind {
    const table: Array<{ kind: DropKind; weight: number }> = [
      // パドル系
      { kind: 'paddleWide', weight: 14 },     // バフ
      { kind: 'paddleNarrow', weight: 8 },    // デバフ
      // 増球系（合計 ≈ 42％）
      { kind: 'multiBall', weight: 18 },      // +2 球
      { kind: 'multiBall3', weight: 12 },     // +3 球
      { kind: 'multiBall5', weight: 6 },      // +5 球
      { kind: 'multiBallDouble', weight: 6 }, // ×2 球
      // ボール速度系
      { kind: 'ballFast', weight: 8 },        // デバフ
      { kind: 'ballSlow', weight: 12 },       // バフ
      // タイム系
      { kind: 'timeExtend', weight: 10 },     // バフ（WAVE タイマー +12s）
    ];
    const total = table.reduce((acc, e) => acc + e.weight, 0);
    let r = this.rng.frac() * total;
    for (const entry of table) {
      r -= entry.weight;
      if (r <= 0) return entry.kind;
    }
    return table[table.length - 1].kind;
  }

  private spawnDrop(x: number, y: number): void {
    const kind = this.pickDropKind();
    const meta = DROP_META[kind];

    const w = 38;
    const h = 38;
    const container = this.add.container(x, y);
    container.setDepth(4500);

    const bg = this.add.rectangle(0, 0, w, h, meta.color, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.95);

    // 上部：バフ／デバフを示す矢印つきバッジ
    const badgeColor = meta.isBuff ? 0x16a34a : 0xdc2626;
    const badge = this.add.rectangle(0, -h / 2 + 6, w - 6, 11, badgeColor, 1);
    badge.setStrokeStyle(1, 0xffffff, 0.9);
    const arrow = this.add.text(0, -h / 2 + 6, meta.isBuff ? '▲BUFF' : '▼DEBUFF', {
      fontSize: '8px',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    });
    arrow.setOrigin(0.5);

    // 中央：効果を示すアイコン
    const icon = this.add.text(0, 2, meta.icon, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    });
    icon.setOrigin(0.5);

    // 下部：日本語ラベル
    const label = this.add.text(0, h / 2 - 7, meta.label, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    container.add([bg, badge, arrow, icon, label]);
    container.setSize(w, h);

    this.physics.world.enable(container);
    this.drops.add(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(0, 145);
    body.setSize(w, h);
    container.setData('kind', kind);

    // 落下中の視認性向上のため軽く揺らす
    this.tweens.add({
      targets: container,
      angle: { from: -6, to: 6 },
      duration: this.tweenDuration(600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private applyDrop(kind: DropKind): void {
    const now = this.time.now;
    if (kind === 'paddleWide') {
      const m = EFFECT_META.paddleWide;
      // 重ねがけ：効果時間を加算、上限60秒
      const base = Math.max(now, this.effectWideUntil);
      this.effectWideUntil = Math.min(base + m.durationMs, now + 60_000);
      // 反対効果を短縮
      if (this.effectNarrowUntil > now) this.effectNarrowUntil = Math.max(now, this.effectNarrowUntil - m.durationMs);
      this.showToast(`${m.label}：${m.description}`, '#16a34a');
    }
    if (kind === 'paddleNarrow') {
      const m = EFFECT_META.paddleNarrow;
      const base = Math.max(now, this.effectNarrowUntil);
      this.effectNarrowUntil = Math.min(base + m.durationMs, now + 60_000);
      if (this.effectWideUntil > now) this.effectWideUntil = Math.max(now, this.effectWideUntil - m.durationMs);
      this.showToast(`${m.label}：${m.description}`, '#ea580c');
    }
    if (kind === 'ballFast') {
      const m = EFFECT_META.ballFast;
      const base = Math.max(now, this.effectFastUntil);
      this.effectFastUntil = Math.min(base + m.durationMs, now + 60_000);
      if (this.effectSlowUntil > now) this.effectSlowUntil = Math.max(now, this.effectSlowUntil - m.durationMs);
      this.scaleBallsSpeed(1.45);
      this.showToast(`${m.label}：${m.description}`, '#dc2626');
    }
    if (kind === 'ballSlow') {
      const m = EFFECT_META.ballSlow;
      const base = Math.max(now, this.effectSlowUntil);
      this.effectSlowUntil = Math.min(base + m.durationMs, now + 60_000);
      if (this.effectFastUntil > now) this.effectFastUntil = Math.max(now, this.effectFastUntil - m.durationMs);
      this.scaleBallsSpeed(0.65);
      this.showToast(`${m.label}：${m.description}`, '#0284c7');
    }
    if (kind === 'multiBall') {
      const added = this.addExtraBalls(2);
      this.showToast(`マルチボール：＋${added} 球`, '#7c3aed');
    }
    if (kind === 'multiBall3') {
      const added = this.addExtraBalls(3);
      this.showToast(`マルチボール：＋${added} 球`, '#7c3aed');
    }
    if (kind === 'multiBall5') {
      const added = this.addExtraBalls(5);
      this.showToast(`マルチボール：＋${added} 球`, '#6d28d9');
    }
    if (kind === 'multiBallDouble') {
      const cur = Math.max(1, this.activeBallCount());
      const added = this.addExtraBalls(cur);
      this.showToast(`マルチボール：×2（＋${added} 球）`, '#a855f7');
    }
    if (kind === 'timeExtend') {
      const addMs = 12_000;
      this.waveTimeRemainingMs = Math.min(this.waveTimeRemainingMs + addMs, this.waveTimerDurationMs);
      this.showToast(`タイム延長：＋${addMs / 1000}s`, '#14b8a6');
    }
  }

  /**
   * 現在のボールに追加でボールを生成する。
   * - 同時アクティブ数を maxActiveBalls で上限制御
   * - 基準座標は既存ボールの位置（無ければパドル上）。
   *   重なって出ると同一フレームの collider が暴れるため、X 軸に少しずつずらす。
   * - 戻り値は実際に追加できた個数。
   */
  private addExtraBalls(count: number): number {
    if (count <= 0) return 0;
    const room = Math.max(0, this.maxActiveBalls - this.activeBallCount());
    const n = Math.min(count, room);
    if (n <= 0) return 0;

    const existing = this.balls.getFirst(true) as Phaser.GameObjects.Arc | null;
    const ox = existing?.x ?? this.paddle.x;
    const oy = existing?.y ?? this.paddle.y - 22;

    for (let i = 0; i < n; i++) {
      const offsetX = (i - (n - 1) / 2) * 14;
      this.spawnBall(ox + offsetX, oy - 8, Phaser.Math.Between(240, 360), true);
    }
    return n;
  }

  /** 全アクティブボールの速度を factor 倍に変更する（取得時の即時反映用） */
  private scaleBallsSpeed(factor: number): void {
    for (const c of this.balls.getChildren()) {
      const ball = c as Phaser.GameObjects.Arc;
      if (!ball.active || !ball.body) continue;
      const body = ball.body as Phaser.Physics.Arcade.Body;
      const len = body.velocity.length();
      if (len < 1) continue;
      const newSpd = Phaser.Math.Clamp(len * factor, 200, 680);
      const ratio = newSpd / len;
      body.setVelocity(body.velocity.x * ratio, body.velocity.y * ratio);
    }
  }

  private tryActivateSkill(): void {
    if (this.awaitingServe) {
      this.releaseAwaitingBall();
      return;
    }
    if (this.skillGauge < 100) return;
    this.skillGauge = 0;
    const m = EFFECT_META.skillSlow;
    this.slowMoUntil = this.time.now + m.durationMs;
    this.refreshHud();
    this.showToast(`${m.label}：${m.description}`, '#9333ea');
  }

  private onBallLost(): void {
    if (this.activeBallCount() > 0) return;
    this.lives -= 1;
    this.stats.missedOnce = true;
    this.refreshHud();
    this.showToast('ボールを失いました', '#dc2626', 900);
    if (this.lives <= 0) {
      this.finishRun();
      return;
    }
    // awaitingServe を経由せず、短い遅延で自動サーブ（ユーザー操作不要）
    this.awaitingServe = false;
    this.respawnPending = true;
    const delayMs = 700;
    this.showToast(`残機 ${this.lives}　${(delayMs / 1000).toFixed(1)}s で再開`, '#0f766e', delayMs + 300);
    this.time.delayedCall(delayMs, () => {
      this.respawnPending = false;
      if (this.lives <= 0) return;
      if (this.activeBallCount() > 0) return;
      this.spawnBall(this.paddle.x, this.paddle.y - this.serveYOffset, undefined, true);
    });
  }

  /** active===true のボール数を厳密にカウント（Group.countActive の挙動差を避ける） */
  private activeBallCount(): number {
    let n = 0;
    for (const c of this.balls.getChildren()) {
      if ((c as Phaser.GameObjects.GameObject).active) n++;
    }
    return n;
  }

  private finishRun(): void {
    this.physics.pause();
    this.stats.survivedMs = this.time.now - this.statsStartTime;
    const survivalBonus = Math.floor(this.stats.survivedMs / 220);
    const noMissBonus = this.stats.missedOnce ? 0 : 6000 + this.wave * 220;
    this.stats.score += survivalBonus + noMissBonus;

    window.dispatchEvent(
      new CustomEvent('breaking-blocks-gameover', {
        detail: { ...this.stats },
      }),
    );
  }

  /** DOM フォールバックからも呼べる公開 API */
  requestPause(): void {
    if (this.bootFailed || this.pausedByUi) return;
    window.dispatchEvent(
      new CustomEvent('breaking-blocks-pause', {
        detail: {
          score: this.stats.score,
          wave: this.wave,
          lives: this.lives,
        },
      }),
    );
    this.pauseFromUi();
  }

  private setupKeys(s: GameSettings): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const rm = (k?: Phaser.Input.Keyboard.Key) => {
      if (k) kb.removeKey(k, true);
    };
    rm(this.keyLeft);
    rm(this.keyRight);
    rm(this.keyPause);
    rm(this.keySkill);
    rm(this.keyServeUp);
    const leftCode = codeToPhaserKeyCode(s.keys.left);
    const rightCode = codeToPhaserKeyCode(s.keys.right);
    const pauseCode = codeToPhaserKeyCode(s.keys.pause);
    const skillCode = codeToPhaserKeyCode(s.keys.skill);
    this.keyLeft = kb.addKey(leftCode);
    this.keyRight = kb.addKey(rightCode);
    this.keyPause = kb.addKey(pauseCode);
    this.keySkill = kb.addKey(skillCode);
    this.keyServeUp = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    // キャンバス非フォーカス時もゲーム操作を受け付ける
    kb.clearCaptures();
    kb.addCapture([leftCode, rightCode, pauseCode, skillCode, Phaser.Input.Keyboard.KeyCodes.UP]);
  }

  private getMotionFactor(): number {
    return this.gameSettings.motionReduced ? 0.38 : 1;
  }

  private tweenDuration(ms: number): number {
    return Math.max(90, Math.floor(ms * this.getMotionFactor()));
  }

  private applyThemeVisuals(): void {
    this.cameras.main.setBackgroundColor(0xf5fbff);

    const muted = '#64748b';
    const scoreC = '#ca8a04';
    const waveC = '#0891b2';
    const comboC = '#c026d3';
    const effectC = '#059669';
    const lives = '#e11d48';

    this.hudScore.setColor(scoreC);
    this.hudWave.setColor(waveC);
    this.hudCombo.setColor(comboC);
    this.hudMaxCombo.setColor(muted);
    this.hudEffects.setColor(effectC);
    this.hudLives.setColor(lives);
    this.hintLine.setColor(muted);

    for (const t of [this.hudScore, this.hudWave, this.hudCombo, this.hudMaxCombo, this.hudEffects, this.hudLives, this.hintLine]) {
      t.setStroke('#000000', 0);
    }

    const gBg = 0xcffafe;
    const gStroke = 0x22d3ee;
    const gFill = 0x06b6d4;
    this.hudGauge.setFillStyle(gBg);
    this.hudGauge.setStrokeStyle(1, gStroke);
    this.hudGaugeFill.setFillStyle(gFill);
  }

  private refreshHudTypography(): void {
    const fs = 1;
    this.hudScore.setFontSize(15 * fs);
    this.hudWave.setFontSize(15 * fs);
    this.hudCombo.setFontSize(15 * fs);
    this.hudMaxCombo.setFontSize(13 * fs);
    this.hudEffects.setFontSize(12 * fs);
    this.hudLives.setFontSize(15 * fs);
    this.hintLine.setFontSize(12 * fs);
    this.hintLine.setText(formatControlsHint(this.gameSettings.language, this.gameSettings.keys));
    this.applyThemeVisuals();
  }
}
