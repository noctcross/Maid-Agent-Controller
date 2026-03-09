/**
 * ログユーティリティ
 *
 * console.log/error を置換するための構造化ログユーティリティ。
 * ログレベル制御、タイムスタンプ付与、呼び出し元情報を提供。
 */
/**
 * ログレベル定義
 */
export declare const LOG_LEVELS: {
    readonly DEBUG: 0;
    readonly INFO: 1;
    readonly WARN: 2;
    readonly ERROR: 3;
    readonly SILENT: 4;
};
export type LogLevel = keyof typeof LOG_LEVELS;
/**
 * ログレベルを動的に変更
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * 現在のログレベルを取得
 */
export declare function getLogLevel(): LogLevel;
/**
 * ログオプション
 */
export interface LogOptions {
    /** 呼び出し元情報を含めるか（デフォルト: false） */
    includeCallerInfo?: boolean;
}
/**
 * ロガーインターフェース
 */
export interface Logger {
    debug(message: string, context?: object, options?: LogOptions): void;
    info(message: string, context?: object, options?: LogOptions): void;
    warn(message: string, context?: object, options?: LogOptions): void;
    error(message: string, error?: Error | object, options?: LogOptions): void;
}
/**
 * デフォルトロガー
 */
export declare const logger: Logger;
/**
 * プレフィックス付きロガーを作成
 * 特定のモジュールやコンポーネント用にログを区別する
 *
 * @example
 * const wsLogger = createPrefixedLogger('WebSocket');
 * wsLogger.info('Connection established'); // [timestamp] [INFO] [WebSocket] Connection established
 */
export declare function createPrefixedLogger(prefix: string): Logger;
