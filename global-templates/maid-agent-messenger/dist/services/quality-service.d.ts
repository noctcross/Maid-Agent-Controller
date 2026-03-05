/**
 * Quality Check Service
 *
 * LLM品質チェックおよび問題分類のサービス
 * - プロジェクト設定読み込み
 * - プロンプト読み込み
 * - 履歴記録
 */
export interface LLMCheckConfig {
    enabled?: boolean;
    model?: string;
    task_types?: string[];
    on_failure?: "warn" | "block";
    timeout?: number;
    score_threshold?: number;
    include_file_contents?: boolean;
    max_lines_per_file?: number;
    max_total_lines?: number;
}
export interface ClassificationConfig {
    enabled?: boolean;
    model?: string;
    confidence_auto_threshold?: number;
    confidence_review_threshold?: number;
    timeout?: number;
}
export interface QualityCheckConfig {
    llm_check?: LLMCheckConfig;
    classification?: ClassificationConfig;
}
export interface ProjectSettings {
    quality_check?: QualityCheckConfig;
}
/**
 * プロジェクト固有の settings.yaml を読み込む
 */
export declare function loadProjectSettings(projectPath: string): Promise<ProjectSettings>;
/**
 * プロンプトファイルを読み込む
 * タスク種別に対応するプロンプトを取得し、なければフォールバック
 */
export declare function readPromptFile(projectPath: string, taskType: string): Promise<string | null>;
/**
 * 品質チェック履歴を記録
 */
export interface QualityHistoryEntry {
    taskId: string;
    taskType: string;
    agent?: string;
    checkType: string;
    result: string;
    score: number | null;
    issues?: string[];
    model?: string;
}
export declare function recordQualityHistory(projectPath: string, data: QualityHistoryEntry): Promise<void>;
/**
 * 問題分類結果を記録
 */
export interface ClassificationResult {
    issueType: "quality_gap" | "new_requirement" | "external";
    confidence: number;
    rationale: string;
    suggestedCategory?: string;
    promptImprovementHint?: string;
}
export declare function recordIssueClassification(projectPath: string, taskId: string, reason: string, classification: ClassificationResult): Promise<void>;
/**
 * 変更ファイル内容
 */
export interface FileContent {
    path: string;
    content: string;
    truncated: boolean;
    lineCount: number;
    error?: string;
}
/**
 * ファイル読み込みオプション
 */
export interface FileReadOptions {
    maxLinesPerFile?: number;
    maxTotalLines?: number;
}
/**
 * 報告書から変更ファイルパスを抽出
 * 「## 変更ファイル」セクションをパースする
 */
export declare function extractChangedFilesFromReport(reportContent: string): string[];
/**
 * ファイル内容を読み込み、トークン制限を適用
 */
export declare function readFileContentsForReview(projectPath: string, filePaths: string[], options?: FileReadOptions): Promise<FileContent[]>;
/**
 * プロンプトにファイル内容を追加
 */
export declare function buildPromptWithFileContents(prompt: string, reportContent: string, fileContents: FileContent[]): string;
/**
 * モデル名を正規化
 * claude CLI 用の短縮名に変換
 */
export declare function normalizeModelName(model: string): string;
export interface ClaudeCLIOptions {
    model?: string;
    timeout?: number;
    outputFormat?: "json" | "text";
}
export interface ClaudeCLIResult {
    success: boolean;
    output: string;
    error?: string;
}
/**
 * Claude CLI を spawn で呼び出す
 * 定額プラン内で利用可能
 */
export declare function runClaudeCLI(prompt: string, options?: ClaudeCLIOptions): Promise<ClaudeCLIResult>;
