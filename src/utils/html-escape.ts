/**
 * HTML特殊文字をエスケープ（XSS防止）
 *
 * 注意: この実装は packages/maid-agent-messenger/src/markdown-utils.ts の
 * escapeHtml() と同一である必要があります。変更時は両方を更新してください。
 * @see packages/maid-agent-messenger/src/markdown-utils.ts
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
