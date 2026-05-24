# Block Breaker Roguelike

透過画像のシルエットをセル化して崩す、ローグライク型無限ウェーブブロック崩し。

## ゲーム概要

- 透過 PNG からシルエットを読み取り、グリッド状のブロックを自動生成
- ウェーブごとに画像・配置・難易度がランダムに変化
- 全ブロック破壊 or 60 秒のウェーブタイマー終了で次ウェーブへ進行
- 残機 0 でゲームオーバー。スコアはローカルに保存（Top 20）

### ブロック種類

| 種類 | 特徴 |
|------|------|
| 通常 | 1HP。シルエットの色で描画 |
| 耐久 | HP 表示あり。ウェーブが進むと HP 増加 |
| 移動 | 水平に往復移動（Wave 3 以降） |
| アイテム | 破壊時にドロップアイテム生成 |
| 消滅 | 薄いティント＋装飾枠で視覚区別 |

### ドロップアイテム

パドル拡大 / 縮小、マルチボール（+2 / +3 / +5 / ×2）、ボール加速 / 減速、タイマー延長

### スキル

ブロック破壊でゲージが溜まり、満タンで **スローモーション**（6.5 秒）を発動可能。

### 難易度（5 段階）

| 難易度 | 速度 | パドル幅 | 密度 |
|--------|------|----------|------|
| Easy | 0.90x | 1.15x | 0.90x |
| Normal | 1.00x | 1.00x | 1.00x |
| Hard | 1.10x | 0.95x | 1.05x |
| Very Hard | 1.18x | 0.90x | 1.10x |
| Extreme | 1.28x | 0.85x | 1.15x |

## 技術スタック

- **TypeScript** + **Phaser 3** — ゲームエンジン・物理演算
- **Vite** — ビルド・開発サーバー
- **pnpm** — パッケージ管理
- **Tauri 2** — Windows デスクトップアプリ化（setup.exe / .msi）

## 動作環境

- Node.js 22.x
- pnpm 10.10+
- Rust（Tauri ビルド時のみ）

## セットアップ

```bash
# 依存インストール
make install

# 開発サーバー起動（http://localhost:5173）
make dev

# 型チェック
make typecheck

# プロダクションビルド
make build
```

### Tauri デスクトップビルド

```bash
# Tauri 開発モード
make tauri-dev

# インストーラー生成（setup.exe / .msi）
make tauri-build
```

## プロジェクト構成

```
src/
  main.ts                       アプリ起動、画面遷移、DOM オーバーレイ管理
  game/
    scenes/RunScene.ts           ゲームプレイの全ロジック（Phaser 唯一の Scene）
    ImageStageGenerator.ts       透過 PNG → グリッドブロック生成
    DifficultyProfile.ts         5 段階難易度の定義
    settingsStore.ts             設定の永続化（localStorage）
    highscores.ts                ハイスコア保存・読込（Top 20）
    keyBindings.ts               キーバインド定義
    uiI18n.ts                    日本語 / 英語の多言語文字列
  app/logger.ts                  インメモリイベントログ
  styles/ui.css                  HTML Shell のスタイル
index.html                       UI シェル（全画面・モーダルの DOM 定義）
public/assets/blocks/            シルエット元画像（block1〜3.png）
src-tauri/                       Tauri 2 デスクトップ設定
仕様書/                           設計ドキュメント
```

## アーキテクチャ

Phaser Scene は **RunScene のみ**。タイトル・難易度選択・設定・一時停止・リザルト・ハイスコア等の UI 画面は **DOM オーバーレイ**（`index.html` + `main.ts`）で実装し、アクセシビリティ（キーボード操作・フォーカス管理）を canvas に依存せず確保している。

```
[HTML Shell (main.ts)]          [Phaser 3]
  Title Screen                    RunScene
  Difficulty Screen     ←→        (gameplay)
  Pause / Result / Settings
  High Scores
```

RunScene はカスタムイベント（`breaking-blocks-pause`, `breaking-blocks-gameover`）で DOM 側と連携する。

## 操作

| 操作 | キー（既定） |
|------|------------|
| パドル移動 | ← → （リバインド可） |
| サーブ | クリック / ↑ / スキルキー |
| 一時停止 | Esc（リバインド可） |
| スキル発動 | Space（リバインド可）/ 右クリック |

マウス / ポインタの X 座標でもパドルを操作可能。

## 設定

- **モーション低減** — アニメーション縮退
- **言語** — 日本語 / English
- **キーバインド変更** — 左右移動・一時停止・スキルの 4 キー
- **ログエクスポート** — イベントログを .txt でダウンロード

## ライセンス

Private
