import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext } from '../types';
import { MAID_AGENT_DIR, MAIDS } from '../constants';
import { getGlobalMaidAgentPath } from '../utils/helpers';
import { CURRENT_ENV } from '../utils/environment';
import { checkAndSetupWsl } from './wsl-setup';
import { setupMcpServer } from './pm2-setup';
import { generateMcpJson, setupClaudeSettings, checkAndUpdateMcpJsonPath } from './mcp-claude-setup';
import { parseRuleModules, parseGlobalSkills, showRuleSelectionUI, showSkillSelectionUI, copySelectedRules, copySelectedSkills } from './rules-skills';

/**
 * ワークスペースを初期化（.maid-agentディレクトリ作成）
 */
export async function initializeWorkspace(ctx: SetupContext): Promise<boolean> {
    if (!ctx.workspaceRoot) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません');
        return false;
    }

    const maidAgentPath = path.join(ctx.workspaceRoot, MAID_AGENT_DIR);
    let preserveInstructions = false;

    if (fs.existsSync(maidAgentPath)) {
        // 上書きされるフォルダを確認（binのみ常に上書き）
        const alwaysOverwriteDirs = ['bin'];
        const existingOverwriteDirs = alwaysOverwriteDirs.filter(dir =>
            fs.existsSync(path.join(maidAgentPath, 'agents', dir)) ||
            fs.existsSync(path.join(maidAgentPath, 'system', dir))
        );

        let message = `.maid-agent ディレクトリは既に存在します。再初期化しますか？`;
        if (existingOverwriteDirs.length > 0) {
            message += `\n\n⚠️ system/bin/ は最新版に上書きされます`;
        }

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            '再初期化', 'キャンセル'
        );
        if (choice !== '再初期化') {
            return false;
        }

        // instructions の上書き確認（カスタマイズ対応）
        const instructionsPath = path.join(maidAgentPath, 'agents', 'instructions');
        if (fs.existsSync(instructionsPath)) {
            const instructionsChoice = await vscode.window.showWarningMessage(
                'agents/instructions/ を上書きしますか？\n\n' +
                '⚠️ カスタマイズしている場合は「保持」を選択してください。',
                { modal: true },
                '上書き', '保持'
            );
            preserveInstructions = instructionsChoice === '保持';
            if (preserveInstructions) {
                ctx.log('[初期化] instructions/ は既存を保持');
            }
        }
    }

    try {
        // テンプレートからコピー
        const extensionPath = ctx.extensionPath;
        if (!extensionPath) {
            throw new Error('拡張機能のパスが取得できません');
        }

        const templatesPath = path.join(extensionPath, 'project-templates');
        ctx.log(`[初期化] extensionPath: ${extensionPath}`);
        ctx.log(`[初期化] templatesPath: ${templatesPath}`);
        ctx.log(`[初期化] project-templates存在: ${fs.existsSync(templatesPath)}`);

        // project-templates/system/resources/images の確認
        const templatesImagesPath = path.join(templatesPath, 'system', 'resources', 'images');
        ctx.log(`[初期化] templates/system/resources/images存在: ${fs.existsSync(templatesImagesPath)}`);
        if (fs.existsSync(templatesImagesPath)) {
            const imageFiles = fs.readdirSync(templatesImagesPath);
            ctx.log(`[初期化] templates/system/resources/images内容: ${imageFiles.join(', ')}`);
        }

        // ディレクトリ構造を作成
        copyDirectorySync(ctx, templatesPath, maidAgentPath, true, { preserveInstructions });

        // コピー後の確認
        const destImagesPath = path.join(maidAgentPath, 'system', 'resources', 'images');
        ctx.log(`[初期化] .maid-agent/system/resources/images存在: ${fs.existsSync(destImagesPath)}`);
        if (fs.existsSync(destImagesPath)) {
            const copiedImages = fs.readdirSync(destImagesPath);
            ctx.log(`[初期化] .maid-agent/system/resources/images内容: ${copiedImages.join(', ')}`);
        }

        // master/reports ディレクトリに各メイド用のファイルを作成
        const reportsPath = path.join(maidAgentPath, 'master', 'reports');
        if (!fs.existsSync(reportsPath)) {
            fs.mkdirSync(reportsPath, { recursive: true });
        }
        for (const maid of MAIDS) {
            const reportFile = path.join(reportsPath, `${maid.id}.md`);
            if (!fs.existsSync(reportFile)) {
                fs.writeFileSync(reportFile, `# 作業報告 - ${maid.name}\n\n(報告なし)\n`);
            }
        }

        // プロジェクトルートの CLAUDE.md を処理
        await setupRootClaudeMd(ctx);

        // グローバル設定のマージ（ルール・スキルの選択）
        await mergeGlobalSettings(ctx, maidAgentPath);

        // 既存の .mcp.json にハードコードパスがある場合、更新を提案
        await checkAndUpdateMcpJsonPath(ctx);

        // .mcp.json を生成（MCPサーバー接続設定）
        await generateMcpJson(ctx);

        // .claude/settings.json を生成（SessionStart hook設定）
        await setupClaudeSettings(ctx);

        ctx.log('[初期化] .maid-agent ディレクトリを作成しました');
        vscode.window.showInformationMessage('🎩 Maid Agent の初期化が完了しました');

        return true;
    } catch (error) {
        ctx.log(`[ERROR] 初期化に失敗: ${error}`);
        vscode.window.showErrorMessage(`初期化に失敗しました: ${error}`);
        return false;
    }
}

/**
 * グローバル設定を初期化（~/.maid-agentディレクトリ作成）
 */
export async function initializeGlobalSettings(ctx: SetupContext): Promise<boolean> {
    ctx.log(`[グローバル] 初期化開始`);

    // Windows環境ではWSL2のチェックを行う（Mac/Linuxでは不要）
    if (CURRENT_ENV === 'windows-native') {
        const wslReady = await checkAndSetupWsl(ctx);
        if (!wslReady) {
            return false; // WSL未設定、再起動が必要
        }
    }
    // Mac/Linux環境のログ出力
    if (CURRENT_ENV === 'macos' || CURRENT_ENV === 'linux') {
        ctx.log(`[グローバル] 環境: ${CURRENT_ENV}（ネイティブ実行）`);
    }

    const globalPath = getGlobalMaidAgentPath();
    ctx.log(`[グローバル] globalPath: ${globalPath}`);

    try {
        // 進捗表示付きで実行
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'グローバル設定を初期化中...',
            cancellable: false
        }, async (progress) => {
            // 拡張機能のパスを取得
            const extensionPath = ctx.extensionPath;
            if (!extensionPath) {
                throw new Error('拡張機能のパスが取得できません');
            }

            const globalTemplatesPath = path.join(extensionPath, 'global-templates');
            ctx.log(`[グローバル] globalTemplatesPath: ${globalTemplatesPath}`);
            ctx.log(`[グローバル] global-templates存在: ${fs.existsSync(globalTemplatesPath)}`);

            progress.report({ message: 'フォルダを作成中...' });

            // global-templates からコピー（maid-agent-messenger の dist を含む）
            if (fs.existsSync(globalTemplatesPath)) {
                try {
                    copyDirectorySync(ctx, globalTemplatesPath, globalPath, true, { includeDist: true });
                    ctx.log(`[グローバル] global-templates からコピー完了`);
                } catch (copyError) {
                    const message = copyError instanceof Error ? copyError.message : String(copyError);
                    ctx.log(`[ERROR] コピー失敗: ${message}`);
                    vscode.window.showErrorMessage(`フォルダのコピーに失敗しました: ${message}`);
                    throw copyError;
                }
            } else {
                // フォールバック: 手動でディレクトリ構造を作成
                ctx.log(`[グローバル] global-templates が見つからないため、手動で構造を作成`);
                const dirs = [
                    '',
                    'rules',
                    'rules/common',
                    'rules/butler',
                    'rules/chief',
                    'rules/maid',
                    'skills',
                    'maid-agent-messenger'
                ];

                for (const dir of dirs) {
                    const fullPath = path.join(globalPath, dir);
                    if (!fs.existsSync(fullPath)) {
                        fs.mkdirSync(fullPath, { recursive: true });
                    }
                }
            }

            // コピー後の検証
            if (!fs.existsSync(globalPath)) {
                throw new Error(`フォルダが作成されませんでした: ${globalPath}`);
            }

            ctx.log(`[グローバル] 設定フォルダを初期化: ${globalPath}`);

            // MCPサーバー (maid-agent-messenger) のセットアップ
            // Windows (WSL), macOS, Linux のいずれでも実行
            if (CURRENT_ENV === 'windows-native' || CURRENT_ENV === 'macos' || CURRENT_ENV === 'linux') {
                progress.report({ message: 'MCPサーバーをセットアップ中...' });
                await setupMcpServer(ctx);
            }

            return true;
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log(`[ERROR] グローバル設定の初期化に失敗: ${message}`);
        vscode.window.showErrorMessage(`グローバル設定の初期化に失敗しました: ${message}`);
        return false;
    }
}

/**
 * グローバル設定をプロジェクトにマージ（ルール・スキルの選択）
 */
export async function mergeGlobalSettings(ctx: SetupContext, maidAgentPath: string): Promise<void> {
    const globalPath = getGlobalMaidAgentPath();

    // グローバルフォルダが存在しない場合は初期化
    if (!fs.existsSync(globalPath)) {
        await initializeGlobalSettings(ctx);
    }

    // ルールの選択
    const rules = parseRuleModules(ctx);
    if (rules.length > 0) {
        const selectedRules = await showRuleSelectionUI(rules);
        if (selectedRules.length > 0) {
            await copySelectedRules(ctx, selectedRules, maidAgentPath);
        }
    }

    // スキルの選択
    const skills = parseGlobalSkills(ctx);
    if (skills.length > 0) {
        const selectedSkills = await showSkillSelectionUI(skills);
        if (selectedSkills.length > 0) {
            // copyDirectorySync をラッパー関数として渡す（ctxを含めた形）
            const copyDirWrapper = (src: string, dest: string) => copyDirectorySync(ctx, src, dest, false);
            await copySelectedSkills(ctx, selectedSkills, maidAgentPath, copyDirWrapper);
        }
    }

    // テンプレートのコピー（グローバルに存在すれば自動コピー）
    await copyGlobalTemplates(ctx, globalPath, maidAgentPath);
}

/**
 * グローバルテンプレートをプロジェクトにコピー
 */
export async function copyGlobalTemplates(ctx: SetupContext, globalPath: string, maidAgentPath: string): Promise<void> {
    const globalReportsPath = path.join(globalPath, 'reports');
    const globalTemplatePath = path.join(globalReportsPath, 'current_template.md');

    // グローバルテンプレートが存在しない場合はスキップ
    if (!fs.existsSync(globalTemplatePath)) {
        return;
    }

    // プロジェクトの master/reports フォルダを作成（なければ）
    const destReportsPath = path.join(maidAgentPath, 'master', 'reports');
    if (!fs.existsSync(destReportsPath)) {
        fs.mkdirSync(destReportsPath, { recursive: true });
    }

    // テンプレートをコピー
    const destTemplatePath = path.join(destReportsPath, 'current_template.md');
    fs.copyFileSync(globalTemplatePath, destTemplatePath);
    ctx.log('[グローバル] テンプレートをコピー: current_template.md');
}

/**
 * プロジェクトルートの CLAUDE.md を処理
 */
export async function setupRootClaudeMd(ctx: SetupContext): Promise<void> {
    if (!ctx.workspaceRoot) return;

    const claudeMdPath = path.join(ctx.workspaceRoot, 'CLAUDE.md');
    const maidAgentHeader = getMaidAgentClaudeHeader();

    if (fs.existsSync(claudeMdPath)) {
        // 既存の CLAUDE.md がある場合
        const existingContent = fs.readFileSync(claudeMdPath, 'utf-8');

        // 既に Maid Agent セクションがある場合はスキップ
        if (existingContent.includes('# Maid Agent System')) {
            ctx.log('[CLAUDE.md] 既に Maid Agent セクションが存在します');
            return;
        }

        // 先頭に追記するか確認
        const choice = await vscode.window.showWarningMessage(
            'CLAUDE.md が既に存在します。Maid Agent の指示を先頭に追加しますか？',
            '追加する', 'スキップ'
        );

        if (choice === '追加する') {
            const newContent = maidAgentHeader + '\n---\n\n' + existingContent;
            fs.writeFileSync(claudeMdPath, newContent);
            ctx.log('[CLAUDE.md] 既存ファイルに Maid Agent 指示を追記しました');
        }
    } else {
        // 新規作成
        fs.writeFileSync(claudeMdPath, maidAgentHeader);
        ctx.log('[CLAUDE.md] 新規作成しました');
    }
}

/**
 * CLAUDE.md に追記する Maid Agent 用のヘッダー
 */
export function getMaidAgentClaudeHeader(): string {
    return `# Maid Agent System

このプロジェクトは Maid Agent マルチエージェントシステムで管理されています。

## セッション開始時（必須）

1. Memory MCP で過去の知識グラフを読み込み（利用可能な場合）
2. \`.maid-agent/agents/context/\` でプロジェクト固有情報を確認
3. 自分の役割を確認（下記参照）

## あなたの役割

起動時に自分の役割を確認してください:
- 🎩 執事 (Butler): \`.maid-agent/agents/instructions/butler.md\` を参照
- 👑 メイド長 (Chief Maid): \`.maid-agent/agents/instructions/chief.md\` を参照
- 🎀 メイド (Maid): \`.maid-agent/agents/instructions/maid.md\` を参照

## 階層構造

\`\`\`
ご主人様 (Human)
    ↓
🎩 執事 ──→ 戦略立案・タスク分解
    ↓
👑 メイド長 ──→ タスク配分・進捗管理
    ↓
🎀 メイド×8 ──→ 実作業担当
\`\`\`

## 重要なルール

1. **指揮系統厳守**: 執事→メイド長→メイド の順序を守る
2. **自己実行禁止**: 執事・メイド長は自分で作業しない
3. **報告はMCPツール**: タスク状態を更新して待機
4. **指示は YAML キュー**: 下への指示は \`.maid-agent/queue/\` のYAMLファイル経由
5. **sendText 2段階**: 通知時はメッセージとEnterを別々に送信

## MCPタスク管理ツール

タスク管理はMCPツール（maid-agent-messenger）経由で行います。

### 新規ツール（tasks.yaml管理）

| ツール | 用途 | 使用者 |
|--------|------|--------|
| \`create_task\` | タスク/サブタスク作成 | 執事 |
| \`get_task\` | タスク詳細取得 | 全員 |
| \`list_tasks\` | タスク一覧取得（フィルタ対応） | 執事・メイド長 |
| \`update_task\` | タスク更新 | メイド長・メイド |

### 既存ツール（維持）

| ツール | 用途 | 使用者 |
|--------|------|--------|
| \`get_my_task\` | 自分のタスク取得 | メイド |
| \`update_status\` | ステータス更新 | メイド |
| \`assign_task\` | タスク割り当て | メイド長 |

詳細は \`.maid-agent/CLAUDE.md\` を参照。

## ファイル構成

- 詳細設計書: \`.maid-agent/CLAUDE.md\`
- プロジェクトコンテキスト: \`.maid-agent/agents/context/\`
- スキル: \`.maid-agent/agents/skills/\`
`;
}

/**
 * ディレクトリを再帰的にコピー
 */
export function copyDirectorySync(ctx: SetupContext, src: string, dest: string, isRoot: boolean = true, options?: { includeDist?: boolean; preserveInstructions?: boolean }): void {
    // 完全スキップ（コピーしない）
    // ※ maid-agent-messenger では dist が必要なので options.includeDist で制御
    const skipDirs = options?.includeDist
        ? ['node_modules', '.git', 'logs']
        : ['node_modules', '.git', 'dist', 'logs'];
    // 保持するディレクトリ（既存フォルダがあればスキップ）
    // ※ system/bin は常に上書き対象（ここに含めない）
    // ※ agents/instructions は preserveInstructions オプションで制御
    // ※ agents/skills はマージ対象（mergeDirs で処理）
    // B案構造: master/（ユーザーデータ保持）, 旧構造の名前も互換性のため残す
    // maid: メイドステータスファイル（任意の深さで保護）
    // data: system/data/（タスク・通知データ保持）
    const preserveDirs = ['master', 'rules', 'images', 'config', 'context', 'notifications', 'reports', 'personas', 'maid', 'data'];
    // マージするディレクトリ（新規のみ追加、既存は保持）
    const mergeDirs = ['skills'];

    // preserveInstructions オプションが true なら instructions も保持対象に追加
    if (options?.preserveInstructions) {
        preserveDirs.push('instructions');
    }

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // 完全スキップ
            if (skipDirs.includes(entry.name)) {
                ctx.log(`[コピー] スキップ: ${entry.name}`);
                continue;
            }
            // マージ対象（新規のみ追加、既存は保持）
            if (mergeDirs.includes(entry.name) && fs.existsSync(destPath)) {
                ctx.log(`[コピー] マージ: ${entry.name}/`);
                mergeDirectorySync(ctx, srcPath, destPath);
                continue;
            }
            // 保持対象かつ既存なら保持（maid/data/configは任意の深さで保護、他はルートレベルのみ）
            const isPreserveDir = preserveDirs.includes(entry.name);
            const shouldPreserve = isPreserveDir && fs.existsSync(destPath) && (isRoot || entry.name === 'maid' || entry.name === 'data' || entry.name === 'config');
            if (shouldPreserve) {
                ctx.log(`[コピー] 既存を保持: ${entry.name}/`);
                continue;
            }
            copyDirectorySync(ctx, srcPath, destPath, false, options);
        } else {
            // ユーザーデータを含むファイルは既存があれば保持
            const preserveFiles = ['tasks.yaml'];
            if (preserveFiles.includes(entry.name) && fs.existsSync(destPath)) {
                ctx.log(`[初期化] ${entry.name} は既存のため保持`);
                continue;
            }
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * ディレクトリをマージ（新規のみ追加、既存は保持）
 */
export function mergeDirectorySync(ctx: SetupContext, src: string, dest: string): void {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        // 既存があればスキップ（保持）
        if (fs.existsSync(destPath)) {
            ctx.log(`[マージ] 既存を保持: ${entry.name}`);
            continue;
        }

        // 新規のみコピー
        if (entry.isDirectory()) {
            copyDirectorySync(ctx, srcPath, destPath, false);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
        ctx.log(`[マージ] 新規追加: ${entry.name}`);
    }
}
