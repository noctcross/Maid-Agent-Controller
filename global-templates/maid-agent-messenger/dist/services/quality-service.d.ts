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
