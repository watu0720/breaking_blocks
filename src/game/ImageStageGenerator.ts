export type BrickKind = 'normal' | 'durable' | 'moving' | 'item' | 'vanishing';

export interface Rng {
  frac(): number;
}

export interface GeneratedBrick {
  gx: number;
  gy: number;
  color: number;
  hp: number;
  kind: BrickKind;
}

const BASE_ALPHA_THRESHOLD = 96;

export function generateBricksFromSilhouette(
  img: HTMLImageElement,
  cols: number,
  rows: number,
  densityMul: number,
  wave: number,
  rng: Rng,
): GeneratedBrick[] {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);
  // ウェーブが上がるほど閾値をわずかに下げ、出現セルが増える（§13 密度増加）
  const waveDensity = 1 + Math.min(0.35, (wave - 1) * 0.028);
  const threshold = BASE_ALPHA_THRESHOLD / (densityMul * waveDensity);
  // ローグライクの「穴」は序盤に多く、進行で減らしてブロック密度を上げる（§13）
  const holeChance = Math.max(0.018, Math.min(0.12, 0.11 - wave * 0.0075));

  const out: GeneratedBrick[] = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = (gy * cols + gx) * 4;
      const a = data[i + 3];
      if (a < threshold) continue;
      if (rng.frac() < holeChance) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const color = (r << 16) | (g << 8) | b;

      const roll = rng.frac();
      let kind: BrickKind = 'normal';
      let hp = 1;

      const itemBias = 0.05 + wave * 0.008;
      // 序盤は動くブロックがチラついて見えるため遅らせる（仕様上は Wave 3 以降で本格出現）
      const moveBias = wave < 3 ? 0 : 0.06 + wave * 0.01;
      const vanishBias = 0.04 + Math.min(0.06, wave * 0.004);
      const durableBias = 0.14 + wave * 0.015;

      if (roll < itemBias) {
        kind = 'item';
      } else if (roll < itemBias + moveBias) {
        kind = 'moving';
      } else if (roll < itemBias + moveBias + vanishBias) {
        kind = 'vanishing';
      } else if (roll < itemBias + moveBias + vanishBias + durableBias) {
        kind = 'durable';
        hp = 2 + Math.min(5, Math.floor(wave / 2));
      }

      out.push({ gx, gy, color, hp, kind });
    }
  }

  return out;
}
