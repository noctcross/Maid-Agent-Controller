/**
 * ファイルロック ユーティリティ
 *
 * 複数エージェントが同時にファイルを更新する際の競合を防止
 */

import * as lockfile from "proper-lockfile";

export interface LockOptions {
  retries?: number;
  stale?: number;
}

const DEFAULT_OPTIONS: LockOptions = {
  retries: 3,
  stale: 10000, // 10秒後にロックが古いとみなす
};

/**
 * ファイルをロックして操作を実行
 * 操作完了後に自動的にロック解除
 */
export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let release: (() => Promise<void>) | null = null;

  try {
    // ロック取得
    release = await lockfile.lock(filePath, {
      retries: {
        retries: opts.retries,
        minTimeout: 100,
        maxTimeout: 1000,
      },
      stale: opts.stale,
    });

    // 操作実行
    return await operation();
  } finally {
    // ロック解除
    if (release) {
      try {
        await release();
      } catch {
        // ロック解除失敗は無視（staleで自動解除される）
      }
    }
  }
}

/**
 * ファイルがロックされているか確認
 */
export async function isLocked(filePath: string): Promise<boolean> {
  try {
    return await lockfile.check(filePath);
  } catch {
    return false;
  }
}
