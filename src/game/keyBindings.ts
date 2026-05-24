import Phaser from 'phaser';

const KC = Phaser.Input.Keyboard.KeyCodes;

/** UI 表示用の短いラベル */
export function formatKeyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    Space: 'Space',
    Enter: 'Enter',
    ShiftLeft: 'Shift(L)',
    ShiftRight: 'Shift(R)',
    ControlLeft: 'Ctrl(L)',
    ControlRight: 'Ctrl(R)',
    AltLeft: 'Alt(L)',
    AltRight: 'Alt(R)',
  };
  if (map[code]) return map[code]!;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

/**
 * KeyboardEvent.code → Phaser のキーコード（数値）。
 * 未対応は SPACE にフォールバック。
 */
export function codeToPhaserKeyCode(code: string): number {
  const fixed: Record<string, number> = {
    ArrowLeft: KC.LEFT,
    ArrowRight: KC.RIGHT,
    ArrowUp: KC.UP,
    ArrowDown: KC.DOWN,
    Escape: KC.ESC,
    Space: KC.SPACE,
    Enter: KC.ENTER,
    ShiftLeft: KC.SHIFT,
    ShiftRight: KC.SHIFT,
    ControlLeft: KC.CTRL,
    ControlRight: KC.CTRL,
    AltLeft: KC.ALT,
    AltRight: KC.ALT,
    Tab: KC.TAB,
    Backspace: KC.BACKSPACE,
  };
  if (fixed[code] !== undefined) return fixed[code]!;

  if (code.startsWith('Key') && code.length === 4) {
    const ch = code[3]!.toUpperCase();
    const n = KC[ch as keyof typeof KC];
    if (typeof n === 'number') return n;
  }

  const digitMap: Record<string, number> = {
    Digit0: KC.ZERO,
    Digit1: KC.ONE,
    Digit2: KC.TWO,
    Digit3: KC.THREE,
    Digit4: KC.FOUR,
    Digit5: KC.FIVE,
    Digit6: KC.SIX,
    Digit7: KC.SEVEN,
    Digit8: KC.EIGHT,
    Digit9: KC.NINE,
  };
  if (digitMap[code] !== undefined) return digitMap[code]!;

  return KC.SPACE;
}
