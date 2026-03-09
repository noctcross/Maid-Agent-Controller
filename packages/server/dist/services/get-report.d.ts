/**
 * get_report ビジネスロジック
 *
 * タスクのレポートファイル内容を取得する処理
 */
export interface GetReportParams {
    taskId: string;
    limit?: number;
}
export interface ReportEntry {
    path: string;
    content: string | null;
    truncated?: boolean;
    totalLines?: number;
    error?: string;
}
export interface GetReportResult {
    success: boolean;
    reports: ReportEntry[];
    message?: string;
}
/**
 * レポート内容を取得
 */
export declare function executeGetReport(projectPath: string, params: GetReportParams): Promise<GetReportResult>;
//# sourceMappingURL=get-report.d.ts.map