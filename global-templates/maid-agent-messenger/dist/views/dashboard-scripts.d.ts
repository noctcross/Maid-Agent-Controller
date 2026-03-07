/**
 * Dashboard JavaScript コード生成
 *
 * ダッシュボード用のスクリプト
 * Goal展開/折りたたみ、ページネーション、フィルター機能
 *
 * @module dashboard-scripts
 */
export { type DashboardScriptParams, getDashboardHeadScript, getReportOverlayScript, } from "./dashboard-scripts-common.js";
/**
 * V2.1 Dashboard用スクリプトを生成
 * Goal展開/折りたたみ機能を提供
 *
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export declare function getDashboardScript(): string;
