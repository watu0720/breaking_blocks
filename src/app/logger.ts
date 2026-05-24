/** 詳細設計のローカルログ（メモリ保持＋エクスポート）。本番ではファイル出力はユーザー操作のみ。 */

const MAX = 120;
const lines: string[] = [];

export function logAppEvent(message: string, detail?: unknown): void {
  const ts = new Date().toISOString();
  const extra = detail !== undefined ? ` ${safeJson(detail)}` : '';
  const row = `[${ts}] ${message}${extra}`;
  lines.push(row);
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
  if (import.meta.env.DEV) console.info(row);
}

export function logAppError(message: string, err?: unknown): void {
  const ts = new Date().toISOString();
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  const row = `[${ts}] ERROR ${message} ${stack}`;
  lines.push(row);
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
  console.error(row);
}

export function exportLogsText(): string {
  return lines.join('\n') + '\n';
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
