/**
 * Dashboard JavaScript コード生成 - 共通モジュール
 *
 * V1/V2共通のユーティリティ関数、状態管理、ページネーション関連のコード
 *
 * @module dashboard-scripts-common
 */
/**
 * スクリプト生成に必要なパラメータ
 */
export interface DashboardScriptParams {
    /** プロジェクトパス */
    projectPath: string;
    /** 完了タスクの総数 */
    completedTotal: number;
    /** サーバーURL (例: http://127.0.0.1:7827) */
    serverUrl: string;
}
/**
 * ダッシュボードのヘッドスクリプトを生成
 * ユーティリティ関数、状態管理、ページネーション関連のコード
 *
 * @param params - スクリプト生成パラメータ
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export declare function getDashboardHeadScript(params: DashboardScriptParams): string;
/**
 * レポートオーバーレイ用スクリプトを生成
 *
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export declare function getReportOverlayScript(): string;
//# sourceMappingURL=dashboard-scripts-common.d.ts.map