/**
 * タスクリストHTML生成
 * generateTaskHtml() - SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */
/**
 * タスクリストのHTMLを生成するヘルパー関数
 * SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */
export declare function generateTaskHtml(tasks: any[], type: string, projectPath: string, scheme?: string): string;
/**
 * 「対応待ち」セクションのHTMLを結合生成
 * masterWaiting（アクティブ）と masterReview（確認待ち）を適切に結合し、
 * 両方空の場合は「なし」を1つだけ表示する
 */
export declare function composeMasterWaitingHtml(masterWaitingTasks: any[], masterReviewTasks: any[], projectPath: string, scheme?: string): string;
