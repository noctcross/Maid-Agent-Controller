/**
 * Dashboard JavaScript コード生成 - エントリポイント
 *
 * dashboard-html.ts から抽出したJavaScriptコードを生成する関数群。
 * CSP制約のためインラインスクリプトとして埋め込む必要がある。
 *
 * V1/V2/共通に分割されたモジュールをre-exportする。
 * - common: 共通ユーティリティ、状態管理、ページネーション
 * - v1: V1ダッシュボード用スクリプト（廃止予定）
 * - v2: V2ダッシュボード用スクリプト
 *
 * @module dashboard-scripts
 */

// 共通モジュール
export {
  type DashboardScriptParams,
  getDashboardHeadScript,
  getReportOverlayScript,
} from "./dashboard-scripts-common.js";

// V1モジュール（廃止予定）
export { getDashboardMainScript } from "./dashboard-scripts-v1.js";

// V2モジュール
export { getV2DashboardScript } from "./dashboard-scripts-v2.js";
