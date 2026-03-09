/**
 * Dashboard HTMLテンプレート生成
 *
 * dashboard-html.ts から抽出したHTMLボディテンプレートを生成する関数群。
 * 統計、チーム状態、タスクリスト等のHTML構造を定義。
 *
 * @module dashboard-template
 */
/**
 * ダッシュボードボディテンプレートのパラメータ
 */
export interface DashboardBodyParams {
    /** プロジェクトパス */
    projectPath: string;
    /** タイムスタンプ（更新時刻） */
    timestamp: string;
    /** 統計情報 */
    stats: {
        pendingCount: number;
        workingCount: number;
        masterWaitingCount: number;
        completedTodayCount: number;
    };
    /** チームステータスHTML */
    teamStatusHtml: string;
    /** 対応待ちセクション件数 */
    masterWaitingCount: number;
    /** 対応待ちセクションHTML */
    masterWaitingSectionHtml: string;
    /** 待機中タスク件数 */
    filteredPendingCount: number;
    /** 待機中タスクHTML */
    pendingHtml: string;
    /** 進行中タスク件数 */
    workingCount: number;
    /** 進行中タスクHTML */
    workingHtml: string;
    /** 完了タスク総数 */
    completedTotal: number;
    /** 完了タスクHTML */
    completedHtml: string;
    /** スキル候補件数 */
    skillCandidatesCount: number;
    /** スキル候補HTML */
    skillCandidatesHtml: string;
    /** 改善提案件数 */
    improvementsCount: number;
    /** 改善提案HTML */
    improvementsHtml: string;
}
/**
 * ダッシュボードのボディテンプレートを生成
 *
 * @param params - テンプレートパラメータ
 * @returns `<body>` タグを含むHTMLボディ文字列（閉じタグなし）
 */
export declare function getDashboardBodyTemplate(params: DashboardBodyParams): string;
/**
 * レポートオーバーレイのHTMLを生成
 *
 * @returns レポートオーバーレイのHTML文字列
 */
export declare function getReportOverlayHtml(): string;
//# sourceMappingURL=dashboard-template.d.ts.map