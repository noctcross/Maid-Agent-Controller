/**
 * ログユーティリティ
 *
 * console.log/error を置換するための構造化ログユーティリティ。
 * ログレベル制御、タイムスタンプ付与、呼び出し元情報を提供。
 */

/**
 * ログレベル定義
 */
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/**
 * 環境変数からログレベルを取得
 * デフォルトは INFO
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return 'INFO';
}

/**
 * 現在のログレベル（環境変数から初期化）
 */
let currentLogLevel: LogLevel = getLogLevelFromEnv();

/**
 * ログレベルを動的に変更
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * 現在のログレベルを取得
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * ISO8601形式のタイムスタンプを生成
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 呼び出し元情報を取得（オプション）
 * スタックトレースから呼び出し元のファイル名と行番号を抽出
 */
function getCallerInfo(): string | null {
  const stack = new Error().stack;
  if (!stack) return null;

  const lines = stack.split('\n');
  // 0: Error, 1: getCallerInfo, 2: formatMessage, 3: log関数, 4: 実際の呼び出し元
  const callerLine = lines[4];
  if (!callerLine) return null;

  // "at functionName (path:line:col)" または "at path:line:col" の形式
  const match = callerLine.match(/at\s+(?:.*\s+)?\(?(.+):(\d+):\d+\)?/);
  if (!match) return null;

  const [, filePath, lineNumber] = match;
  // ファイル名のみを抽出
  const fileName = filePath.split('/').pop() || filePath;
  return `${fileName}:${lineNumber}`;
}

/**
 * ログメッセージをフォーマット
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: object,
  includeCallerInfo = false
): string {
  const timestamp = getTimestamp();
  const callerInfo = includeCallerInfo ? getCallerInfo() : null;

  let formattedMessage = `[${timestamp}] [${level}]`;
  if (callerInfo) {
    formattedMessage += ` [${callerInfo}]`;
  }
  formattedMessage += ` ${message}`;

  if (context && Object.keys(context).length > 0) {
    formattedMessage += ` ${JSON.stringify(context)}`;
  }

  return formattedMessage;
}

/**
 * 指定レベルでログを出力すべきか判定
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

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
export const logger: Logger = {
  debug(message: string, context?: object, options?: LogOptions): void {
    if (!shouldLog('DEBUG')) return;
    const formattedMessage = formatMessage('DEBUG', message, context, options?.includeCallerInfo);
    console.debug(formattedMessage);
  },

  info(message: string, context?: object, options?: LogOptions): void {
    if (!shouldLog('INFO')) return;
    const formattedMessage = formatMessage('INFO', message, context, options?.includeCallerInfo);
    console.info(formattedMessage);
  },

  warn(message: string, context?: object, options?: LogOptions): void {
    if (!shouldLog('WARN')) return;
    const formattedMessage = formatMessage('WARN', message, context, options?.includeCallerInfo);
    console.warn(formattedMessage);
  },

  error(message: string, error?: Error | object, options?: LogOptions): void {
    if (!shouldLog('ERROR')) return;

    let context: object | undefined;
    if (error instanceof Error) {
      context = {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      };
    } else if (error) {
      context = error;
    }

    const formattedMessage = formatMessage('ERROR', message, context, options?.includeCallerInfo);
    console.error(formattedMessage);
  },
};

/**
 * プレフィックス付きロガーを作成
 * 特定のモジュールやコンポーネント用にログを区別する
 *
 * @example
 * const wsLogger = createPrefixedLogger('WebSocket');
 * wsLogger.info('Connection established'); // [timestamp] [INFO] [WebSocket] Connection established
 */
export function createPrefixedLogger(prefix: string): Logger {
  return {
    debug(message: string, context?: object, options?: LogOptions): void {
      logger.debug(`[${prefix}] ${message}`, context, options);
    },
    info(message: string, context?: object, options?: LogOptions): void {
      logger.info(`[${prefix}] ${message}`, context, options);
    },
    warn(message: string, context?: object, options?: LogOptions): void {
      logger.warn(`[${prefix}] ${message}`, context, options);
    },
    error(message: string, error?: Error | object, options?: LogOptions): void {
      logger.error(`[${prefix}] ${message}`, error, options);
    },
  };
}
