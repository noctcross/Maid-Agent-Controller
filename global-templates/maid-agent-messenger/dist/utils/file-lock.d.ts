/**
 * ファイルロック ユーティリティ
 *
 * 複数エージェントが同時にファイルを更新する際の競合を防止
 */
export interface LockOptions {
    retries?: number;
    stale?: number;
}
/**
 * ファイルをロックして操作を実行
 * 操作完了後に自動的にロック解除
 */
export declare function withFileLock<T>(filePath: string, operation: () => Promise<T>, options?: LockOptions): Promise<T>;
/**
 * ファイルがロックされているか確認
 */
export declare function isLocked(filePath: string): Promise<boolean>;
//# sourceMappingURL=file-lock.d.ts.map