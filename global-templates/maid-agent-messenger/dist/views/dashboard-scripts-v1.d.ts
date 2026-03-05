/**
 * Dashboard JavaScript コード生成 - V1モジュール
 *
 * V1ダッシュボード用のメインスクリプト
 * イベントハンドラ、WebSocket接続、タスク更新関連のコード
 *
 * @deprecated V1は将来廃止予定。新機能はV2に追加すること。
 * @module dashboard-scripts-v1
 */
import type { DashboardScriptParams } from "./dashboard-scripts-common.js";
/**
 * ダッシュボードのメインスクリプトを生成
 * イベントハンドラ、WebSocket接続、タスク更新関連のコード
 *
 * @param params - スクリプト生成パラメータ
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export declare function getDashboardMainScript(params: DashboardScriptParams): string;
