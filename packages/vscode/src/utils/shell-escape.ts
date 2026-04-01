/**
 * シェルエスケープユーティリティ
 *
 * 環境ごとに異なるエスケープ規則を一元管理する。
 * 各モジュールはインラインでエスケープせず、本モジュールの関数を使用すること。
 */

import type { MultiplexerType } from '../multiplexer/interfaces';

/** エスケープ対象のシェル種別 */
export type ShellType = 'bash' | 'powershell' | 'cmd';

/**
 * ダブルクォート内の文字列をエスケープ
 *
 * ダブルクォートで囲む前提で、シェルメタ文字をエスケープする。
 * 囲みクォート自体は付与しない。
 */
export function escapeForDoubleQuote(value: string, shell: ShellType): string {
    switch (shell) {
        case 'bash':
            return value
                .replace(/\\/g, '\\\\')   // \ → \\ （最初に処理）
                .replace(/"/g, '\\"')      // " → \"
                .replace(/\$/g, '\\$')     // $ → \$
                .replace(/`/g, '\\`');     // ` → \`
        case 'powershell':
            return value
                .replace(/`/g, '``')       // ` → `` （最初に処理）
                .replace(/"/g, '`"')       // " → `"
                .replace(/\$/g, '`$');     // $ → `$
        case 'cmd':
            return value
                .replace(/"/g, '""');      // " → ""（cmd.exeのダブルクォートエスケープ）
    }
}

/**
 * シングルクォート内の文字列をエスケープ（bash専用）
 *
 * bash のシングルクォートは \ や $ を解釈しないため、
 * エスケープが必要なのはシングルクォート自体のみ。
 */
export function escapeForSingleQuote(value: string): string {
    return value.replace(/'/g, "'\\''");
}

/**
 * tmux/psmux send-keys 専用エスケープ
 *
 * マルチプレクサの種別に応じて適切なエスケープを適用し、
 * 囲みクォート付きの文字列を返す。
 */
export function escapeForSendKeys(
    value: string,
    multiplexerType: MultiplexerType,
): string {
    const noNewlines = value.replace(/\r?\n/g, ' ');
    if (multiplexerType === 'psmux') {
        return `"${escapeForDoubleQuote(noNewlines, 'powershell')}"`;
    }
    return `'${escapeForSingleQuote(noNewlines)}'`;
}

/**
 * コマンド引数をクォート付きでエスケープ（最も汎用的）
 *
 * シェルに応じて適切なクォーティング+エスケープを適用し、
 * 囲み文字を含む文字列を返す。
 */
export function quoteArg(value: string, shell: ShellType): string {
    switch (shell) {
        case 'bash':
            // bash ではシングルクォートが最も安全
            return `'${escapeForSingleQuote(value)}'`;
        case 'powershell':
            return `"${escapeForDoubleQuote(value, 'powershell')}"`;
        case 'cmd':
            return `"${escapeForDoubleQuote(value, 'cmd')}"`;
    }
}

/**
 * 環境変数をセットしてコマンドを実行する構文を構築
 *
 * シェルに応じた環境変数設定構文でコマンドをラップする。
 * - bash: `VAR1=value1 VAR2=value2 command`
 * - powershell: `$env:VAR1 = 'value1'; $env:VAR2 = 'value2'; command`
 */
export function buildCommandWithEnvVars(
    envVars: Record<string, string>,
    command: string,
    shell: ShellType,
): string {
    const entries = Object.entries(envVars);
    if (entries.length === 0) {
        return command;
    }

    switch (shell) {
        case 'powershell': {
            const envParts = entries
                .map(([key, value]) => `$env:${key} = '${value.replace(/'/g, "''")}'`)
                .join('; ');
            return `${envParts}; ${command}`;
        }
        case 'bash':
        default: {
            const envParts = entries
                .map(([key, value]) => `${key}=${value}`)
                .join(' ');
            return `${envParts} ${command}`;
        }
    }
}

/**
 * 危険なシェルメタ文字のバリデーション
 *
 * コマンド実行前のガードとして使用。
 * メタ文字が含まれていた場合は例外を投げる。
 */
export function assertNoShellMeta(value: string, context?: string): void {
    const metaChars = /[;&|`$()\n\r<>]/;
    if (metaChars.test(value)) {
        const ctx = context ? ` (${context})` : '';
        throw new Error(
            `Shell meta characters detected in value${ctx}: ${value.slice(0, 50)}`
        );
    }
}
