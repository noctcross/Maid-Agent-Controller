/**
 * ダッシュボード SPA版 HTML生成
 * 静的HTMLシェル + クライアントJSでAPI呼び出し
 *
 * 全機能実装版:
 * - アコーディオン開閉（Goals/Works/Steps）
 * - タブ切り替え（Open/Closed）
 * - 検索・フィルタリング
 * - ページネーション
 * - タスク操作（アーカイブ/スター/レビュー/Close）
 * - 報告書表示（Markdownレンダリング）
 * - WebSocketリアルタイム更新
 */
/**
 * SPA版ダッシュボードの静的HTMLシェルを生成
 */
export declare function generateDashboardSpaHtml(projectPath: string, serverUrl: string): string;
