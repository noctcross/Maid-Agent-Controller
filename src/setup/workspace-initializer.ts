import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext, GlobalRequirements, UnifiedUserInput, SetupResult, SetupItem } from '../types';
import { MAID_AGENT_DIR, MAIDS } from '../constants';
import { getGlobalMaidAgentPath } from '../utils/helpers';
import { CURRENT_ENV } from '../utils/environment';
import { checkAndSetupWsl, checkWslStatus, checkPasswordlessSudo, setupPasswordlessSudoWithPassword } from './wsl-setup';
import { setupMcpServer, checkPm2Installed, checkPm2StartupConfigured, installPm2WithPassword, runNpmInstallForMcp, startPm2Server, setupPm2StartupWithPassword } from './pm2-setup';
import { generateMcpJson, setupClaudeSettings, checkAndUpdateMcpJsonPath } from './mcp-claude-setup';
import { parseRuleModules, parseGlobalSkills, showRuleSelectionUI, showSkillSelectionUI, copySelectedRules, copySelectedSkills } from './rules-skills';
import { collectUnifiedInput, showGlobalSetupResult } from './setup-ui';

/**
 * instructionsの差分をチェックし、変更があればバックアップして更新
 * @returns 更新されたファイル名の配列
 */
export function updateInstructionsWithBackup(
    ctx: SetupContext,
    templateInstructionsPath: string,
    projectInstructionsPath: string
): string[] {
    const updatedFiles: string[] = [];

    if (!fs.existsSync(templateInstructionsPath)) {
        ctx.log('[Instructions] テンプレートが見つかりません');
        return updatedFiles;
    }

    // バックアップフォルダを作成
    const backupDir = path.join(projectInstructionsPath, 'backup');

    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15); // YYYYMMDD_HHmmss

    const templateFiles = fs.readdirSync(templateInstructionsPath, { withFileTypes: true });

    for (const entry of templateFiles) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const templateFilePath = path.join(templateInstructionsPath, entry.name);
        const projectFilePath = path.join(projectInstructionsPath, entry.name);

        // 既存ファイルがなければ単純コピー
        if (!fs.existsSync(projectFilePath)) {
            fs.copyFileSync(templateFilePath, projectFilePath);
            ctx.log(`[Instructions] 新規作成: ${entry.name}`);
            continue;
        }

        // 差分チェック
        const templateContent = fs.readFileSync(templateFilePath, 'utf-8');
        const projectContent = fs.readFileSync(projectFilePath, 'utf-8');

        if (templateContent === projectContent) {
            ctx.log(`[Instructions] 変更なし: ${entry.name}`);
            continue;
        }

        // 差分あり → バックアップして更新
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const baseName = entry.name.replace('.md', '');
        const backupFileName = `${baseName}_${timestamp}.md`;
        const backupFilePath = path.join(backupDir, backupFileName);

        fs.copyFileSync(projectFilePath, backupFilePath);
        fs.copyFileSync(templateFilePath, projectFilePath);

        ctx.log(`[Instructions] 更新: ${entry.name} (バックアップ: backup/${backupFileName})`);
        updatedFiles.push(entry.name);
    }

    return updatedFiles;
}

/**
 * ワークスペースを初期化（.maid-agentディレクトリ作成）
 */
export async function initializeWorkspace(ctx: SetupContext): Promise<boolean> {
    if (!ctx.workspaceRoot) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません');
        return false;
    }

    const maidAgentPath = path.join(ctx.workspaceRoot, MAID_AGENT_DIR);
    const isReInit = fs.existsSync(maidAgentPath);

    if (isReInit) {
        // 上書きされるフォルダを確認（binのみ常に上書き）
        const alwaysOverwriteDirs = ['bin'];
        const existingOverwriteDirs = alwaysOverwriteDirs.filter(dir =>
            fs.existsSync(path.join(maidAgentPath, 'agents', dir)) ||
            fs.existsSync(path.join(maidAgentPath, 'system', dir))
        );

        let message = `.maid-agent ディレクトリは既に存在します。再初期化しますか？`;
        if (existingOverwriteDirs.length > 0) {
            message += `\n\n⚠️ system/bin/ と agents/instructions/ は最新版に更新されます`;
            message += `\n（カスタム設定は instructions/backup/ に保存されます）`;
        }

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            '再初期化', 'キャンセル'
        );
        if (choice !== '再初期化') {
            return false;
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

        // ディレクトリ構造を作成（instructionsは一旦スキップ）
        copyDirectorySync(ctx, templatesPath, maidAgentPath, true, { preserveInstructions: isReInit });

        // instructions の差分更新（再初期化時のみ）
        const templateInstructionsPath = path.join(templatesPath, 'agents', 'instructions');
        const projectInstructionsPath = path.join(maidAgentPath, 'agents', 'instructions');
        let updatedInstructions: string[] = [];

        if (isReInit) {
            // 再初期化: 差分があればバックアップして更新
            updatedInstructions = updateInstructionsWithBackup(ctx, templateInstructionsPath, projectInstructionsPath);
        } else {
            // 新規初期化: そのままコピー（copyDirectorySyncで処理済み）
        }

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

        // 更新された instructions の通知
        if (updatedInstructions.length > 0) {
            const fileList = updatedInstructions.join(', ');
            vscode.window.showWarningMessage(
                `📝 instructions が更新されました: ${fileList}\n` +
                `カスタム設定を適用するには agents/instructions/backup/ を参照してください`,
                { modal: false }
            );
        }

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
 * 統一入力フロー: 事前調査 → 入力一括取得 → 自動実行 → 結果表示
 */
export async function initializeGlobalSettings(ctx: SetupContext): Promise<boolean> {
    ctx.log(`[グローバル] 初期化開始`);
    ctx.log(`[グローバル] 環境: ${CURRENT_ENV}`);

    try {
        // Phase 1: 事前調査
        const requirements = analyzeGlobalRequirements(ctx);

        // すべて設定済みの場合はフォルダコピーのみ実行
        if (!requirements.needsAnyAction) {
            ctx.log('[グローバル] MCPサーバー関連は設定済み、フォルダコピーのみ実行');
            await copyGlobalTemplatesOnly(ctx);
            vscode.window.showInformationMessage('✅ グローバル設定は既に完了しています');
            return true;
        }

        // Phase 2: 入力一括取得
        const userInput = await collectUnifiedInput(ctx, requirements);
        if (!userInput.approved) {
            ctx.log('[グローバル] ユーザーがキャンセルしました');
            return false;
        }

        // 再起動が必要な場合（WSL/Ubuntuインストール）
        if (requirements.needsReboot) {
            return await handleRebootFlow(ctx, requirements);
        }

        // Phase 3: 自動実行
        const result = await executeGlobalSetup(ctx, requirements, userInput);

        // Phase 4: 結果表示
        showGlobalSetupResult(ctx, result, userInput.skippedItems);

        return result.success;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log(`[ERROR] グローバル設定の初期化に失敗: ${message}`);
        vscode.window.showErrorMessage(`グローバル設定の初期化に失敗しました: ${message}`);
        return false;
    }
}

/**
 * Phase 1: 事前調査 - 必要なアクションを特定
 */
function analyzeGlobalRequirements(ctx: SetupContext): GlobalRequirements {
    ctx.log('[グローバル] Phase 1: 事前調査開始');

    const isWindows = CURRENT_ENV === 'windows-native';
    const isMac = CURRENT_ENV === 'macos';
    const isLinux = CURRENT_ENV === 'linux';

    // WSL関連のチェック（Windowsのみ）
    let needsWslInstall = false;
    let needsUbuntuInstall = false;
    let needsPasswordlessSudo = false;

    if (isWindows) {
        const wslStatus = checkWslStatus();
        needsWslInstall = wslStatus.needsWslInstall;
        needsUbuntuInstall = wslStatus.needsUbuntuInstall;
        needsPasswordlessSudo = wslStatus.needsPasswordlessSudo;
        ctx.log(`[グローバル] WSLステータス: install=${needsWslInstall}, ubuntu=${needsUbuntuInstall}, sudo=${needsPasswordlessSudo}`);
    }

    // pm2関連のチェック
    const needsPm2Install = !checkPm2Installed();
    const needsPm2Startup = !checkPm2StartupConfigured();
    ctx.log(`[グローバル] pm2ステータス: install=${needsPm2Install}, startup=${needsPm2Startup}`);

    // パスワードが必要かどうか
    // パスワードレスsudoが未設定で、かつpm2インストール/startup設定が必要な場合
    let needsSudoPassword = false;
    if (isWindows) {
        needsSudoPassword = needsPasswordlessSudo && (needsPm2Install || needsPm2Startup);
    } else {
        // Mac/Linux: パスワードレスsudoをチェック
        try {
            const { execSync } = require('child_process');
            execSync('sudo -n true 2>/dev/null', { stdio: 'pipe', timeout: 5000 });
            needsSudoPassword = false;
        } catch {
            needsSudoPassword = needsPm2Install || needsPm2Startup;
        }
    }
    ctx.log(`[グローバル] パスワード必要: ${needsSudoPassword}`);

    const needsReboot = needsWslInstall || needsUbuntuInstall;
    const needsAnyAction = needsPasswordlessSudo || needsPm2Install || needsPm2Startup || needsReboot;

    ctx.log(`[グローバル] Phase 1完了: needsAnyAction=${needsAnyAction}, needsReboot=${needsReboot}`);

    return {
        isWindows,
        isMac,
        isLinux,
        needsWslInstall,
        needsUbuntuInstall,
        needsPasswordlessSudo,
        needsPm2Install,
        needsPm2Startup,
        needsSudoPassword,
        needsAnyAction,
        needsReboot
    };
}

/**
 * 再起動が必要な場合のフロー（WSL/Ubuntuインストール）
 */
async function handleRebootFlow(ctx: SetupContext, requirements: GlobalRequirements): Promise<boolean> {
    // checkAndSetupWsl を使用してWSL/Ubuntuをインストール
    const result = await checkAndSetupWsl(ctx);
    return result;
}

/**
 * Phase 3: 自動実行 - 進捗表示付きで各ステップを実行
 */
async function executeGlobalSetup(
    ctx: SetupContext,
    requirements: GlobalRequirements,
    userInput: UnifiedUserInput
): Promise<SetupResult> {
    const completedSteps: string[] = [];
    const globalPath = getGlobalMaidAgentPath();

    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'グローバル設定を実行中...',
        cancellable: false
    }, async (progress) => {
        try {
            // Step 1: フォルダ作成・コピー
            progress.report({ message: 'フォルダを作成中...', increment: 10 });
            await copyGlobalTemplatesOnly(ctx);
            completedSteps.push('フォルダ作成');

            // Step 2: パスワードレスsudo設定（Windows、スキップされていない場合）
            if (requirements.needsPasswordlessSudo &&
                !userInput.skippedItems.includes('passwordlessSudo')) {
                progress.report({ message: 'sudo設定中...', increment: 20 });
                await setupPasswordlessSudoWithPassword(ctx, userInput.password!);
                completedSteps.push('パスワードレスsudo');
            }

            // Step 3: pm2インストール（スキップされていない場合）
            if (requirements.needsPm2Install &&
                !userInput.skippedItems.includes('pm2Install')) {
                progress.report({ message: 'pm2をインストール中...', increment: 20 });
                await installPm2WithPassword(ctx, userInput.password);
                completedSteps.push('pm2インストール');
            }

            // Step 4: npm install
            progress.report({ message: '依存関係をインストール中...', increment: 20 });
            await runNpmInstallForMcp(ctx);
            completedSteps.push('npm install');

            // Step 5: pm2 start/save
            progress.report({ message: 'MCPサーバーを起動中...', increment: 10 });
            await startPm2Server(ctx);
            completedSteps.push('pm2起動');

            // Step 6: pm2 startup（スキップされていない場合）
            if (requirements.needsPm2Startup &&
                !userInput.skippedItems.includes('pm2Startup')) {
                progress.report({ message: '自動起動を設定中...', increment: 10 });
                await setupPm2StartupWithPassword(ctx, userInput.password);
                completedSteps.push('自動起動設定');
            }

            progress.report({ message: '完了', increment: 10 });
            return { success: true, completedSteps };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.log(`[ERROR] 実行失敗: ${message}`);
            return {
                success: false,
                completedSteps,
                failedStep: getNextStep(completedSteps),
                error: message
            };
        }
    });
}

/**
 * 次のステップ名を取得（エラー時のレポート用）
 */
function getNextStep(completedSteps: string[]): string {
    const allSteps = ['フォルダ作成', 'パスワードレスsudo', 'pm2インストール', 'npm install', 'pm2起動', '自動起動設定'];
    const lastCompleted = completedSteps[completedSteps.length - 1];
    const lastIndex = allSteps.indexOf(lastCompleted);
    return allSteps[lastIndex + 1] || '不明';
}

/**
 * グローバルテンプレートのコピーのみ実行
 */
async function copyGlobalTemplatesOnly(ctx: SetupContext): Promise<void> {
    const globalPath = getGlobalMaidAgentPath();
    const extensionPath = ctx.extensionPath;

    if (!extensionPath) {
        throw new Error('拡張機能のパスが取得できません');
    }

    const globalTemplatesPath = path.join(extensionPath, 'global-templates');
    ctx.log(`[グローバル] globalTemplatesPath: ${globalTemplatesPath}`);
    ctx.log(`[グローバル] global-templates存在: ${fs.existsSync(globalTemplatesPath)}`);

    if (fs.existsSync(globalTemplatesPath)) {
        copyDirectorySync(ctx, globalTemplatesPath, globalPath, true, { includeDist: true });
        ctx.log(`[グローバル] global-templates からコピー完了`);
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

            // Mac/Linux環境でbin/ディレクトリ内のファイルに実行権限を付与
            if (CURRENT_ENV !== 'windows-native' && srcPath.includes('/bin/')) {
                try {
                    fs.chmodSync(destPath, 0o755);
                    ctx.log(`[初期化] 実行権限付与: ${entry.name}`);
                } catch (e) {
                    ctx.log(`[初期化] chmod失敗: ${entry.name}`);
                }
            }
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
