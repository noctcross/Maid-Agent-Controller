import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SetupContext } from '../types';
import { MAID_AGENT_DIR, MAIDS } from '../constants';
import { getGlobalMaidAgentPath } from '../utils/helpers';
import { CURRENT_ENV } from '../utils/environment';
import { checkAndSetupWsl, checkAndInstallJq } from './wsl-setup';
import { setupMcpServer } from './pm2-setup';
import { generateMcpJson, setupClaudeSettings, checkAndUpdateMcpJsonPath } from './mcp-claude-setup';
import { parseRuleModules, parseGlobalSkills, showRuleSelectionUI, showSkillSelectionUI, copySelectedRules, copySelectedSkills } from './rules-skills';

const execAsync = promisify(exec);

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
        const templateInstructionsPath = path.join(templatesPath, '.claude', 'instructions');
        const projectInstructionsPath = path.join(maidAgentPath, '.claude', 'instructions');
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

        // グローバル設定のマージ（ルール・スキルの選択）
        await mergeGlobalSettings(ctx, maidAgentPath);

        // 注: --add-dir方式ではルートCLAUDE.mdへの追記・シンボリックリンク作成は不要

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
 *
 * 新しい4フェーズ構造に委譲:
 * フェーズ1: 事前調査（自動）
 * フェーズ2: 入力一括取得（ユーザー操作1回）
 * フェーズ3: 自動実行（進捗表示のみ）
 * フェーズ4: 結果表示
 */
export async function initializeGlobalSettings(ctx: SetupContext): Promise<boolean> {
    // 新しい4フェーズ構造に委譲
    const { initializeGlobalSettingsNew } = await import('./global-init');
    return initializeGlobalSettingsNew(ctx);
}

/**
 * maidctl CLIツールを配置（確認とログ出力）
 * @returns 配置が成功したかどうか
 */
export async function deployMaidctl(ctx: SetupContext, globalPath: string): Promise<boolean> {
    const binDir = path.join(globalPath, 'bin');
    const maidctlPath = path.join(binDir, 'maidctl');

    // maidctl の存在確認
    if (!fs.existsSync(maidctlPath)) {
        ctx.log('[maidctl] maidctl が見つかりません（global-templates/bin/ にない可能性）');
        return false;
    }

    // 実行権限の確認・付与
    if (CURRENT_ENV === 'windows-native') {
        // Windows: WSL経由でchmod
        try {
            await execAsync('wsl chmod +x ~/.maid-agent/bin/maidctl');
            ctx.log('[maidctl] WSL経由で実行権限を付与しました');
        } catch (e) {
            ctx.log(`[maidctl] WSL経由の実行権限付与に失敗: ${e}`);
        }
    } else {
        // Mac/Linux: 直接chmod
        try {
            const stats = fs.statSync(maidctlPath);
            const isExecutable = (stats.mode & 0o111) !== 0;

            if (!isExecutable) {
                fs.chmodSync(maidctlPath, 0o755);
                ctx.log('[maidctl] 実行権限を付与しました');
            }
        } catch (e) {
            ctx.log(`[maidctl] 実行権限の確認/付与に失敗: ${e}`);
        }
    }

    ctx.log(`[maidctl] CLIツールを配置しました: ${maidctlPath}`);
    return true;
}

/**
 * PATH設定・環境変数を確認付きで自動設定
 * --add-dir 方式で必要な CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD も設定
 */
export async function setupPathWithConfirmation(ctx: SetupContext, globalPath: string): Promise<void> {
    // シェル設定ファイルを推定
    const shell = process.env.SHELL || '/bin/bash';
    const rcFileName = shell.includes('zsh') ? '.zshrc' : '.bashrc';
    const rcFilePath = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';

    // 先に既存設定をチェック
    let hasPath = false;
    let hasEnvVar = false;
    let rcFullPath = '';

    try {
        if (CURRENT_ENV === 'windows-native') {
            // Windows: wslpathでWindowsパスを取得
            const wslPathResult = await execAsync(`wsl wslpath -w ~/${rcFileName}`);
            rcFullPath = wslPathResult.stdout.trim();
            ctx.log(`[PATH設定] WSLパス: ${rcFullPath}`);

            if (fs.existsSync(rcFullPath)) {
                const content = fs.readFileSync(rcFullPath, 'utf-8');
                hasPath = content.includes('maid-agent/bin');
                hasEnvVar = content.includes('CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD');
            }
        } else {
            // Mac/Linux
            const homeDir = process.env.HOME || '';
            rcFullPath = path.join(homeDir, rcFileName);

            if (fs.existsSync(rcFullPath)) {
                const content = fs.readFileSync(rcFullPath, 'utf-8');
                hasPath = content.includes('maid-agent/bin');
                hasEnvVar = content.includes('CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD');
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log(`[PATH設定] 既存設定チェックに失敗: ${message}`);
    }

    ctx.log(`[PATH設定] 既存設定チェック結果: PATH=${hasPath ? '存在' : '未設定'}, ENV_VAR=${hasEnvVar ? '存在' : '未設定'}`);

    // 両方設定済みならスキップ
    if (hasPath && hasEnvVar) {
        ctx.log('[PATH設定] 既に全て設定済みのためスキップ');
        return;
    }

    // 確認ダイアログを表示
    const choice = await vscode.window.showInformationMessage(
        '🛠️ maidctl と Claude Code の設定を追加してよろしいですか？',
        { modal: false },
        'はい（自動設定）',
        'いいえ（手動設定）'
    );

    if (choice === 'はい（自動設定）') {
        ctx.log('[PATH設定] 自動設定を開始します');
        try {
            // 不足分のみ追記
            let appendContent = '\n# Maid Agent CLI\n';
            if (!hasPath) {
                appendContent += 'export PATH="$HOME/.maid-agent/bin:$PATH"\n';
            }
            if (!hasEnvVar) {
                appendContent += 'export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1\n';
            }
            fs.appendFileSync(rcFullPath, appendContent);
            ctx.log(`[PATH設定] ${rcFilePath} に追記しました`);
            vscode.window.showInformationMessage(
                `✅ 設定を ${rcFilePath} に追加しました。新しいターミナルで有効になります。`
            );
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.log(`[PATH設定] 自動設定に失敗: ${message}`);
            // 失敗時は手動設定ガイダンスを表示
            showPathGuidance(ctx, globalPath);
            return;
        }
    }

    if (choice === 'いいえ（手動設定）') {
        // 手動設定ガイダンスを表示
        ctx.log('[PATH設定] 手動設定を選択しました');
        showPathGuidance(ctx, globalPath);
    } else {
        // ダイアログを閉じた場合（choice === undefined）は何もしない
        ctx.log('[PATH設定] 設定をスキップしました');
    }
}

/**
 * PATH設定ガイダンスを表示（手動設定用）
 */
export function showPathGuidance(ctx: SetupContext, globalPath: string): void {
    const binPath = path.join(globalPath, 'bin');

    // シェル設定ファイルを推定
    const shell = process.env.SHELL || '/bin/bash';
    const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';

    // Windows環境ではWSL内のパスを表示
    let pathCommand: string;
    if (CURRENT_ENV === 'windows-native') {
        // WSL内のパス（~/.maid-agent/bin）
        pathCommand = `echo 'export PATH="$HOME/.maid-agent/bin:$PATH"' >> ${rcFile}`;
    } else {
        // Mac/Linux環境
        pathCommand = `echo 'export PATH="${binPath}:$PATH"' >> ${rcFile}`;
    }

    const guidance = `
┌─────────────────────────────────────────────────────────────┐
│  maidctl CLI を使用するには PATH を設定してください         │
├─────────────────────────────────────────────────────────────┤
│  ${pathCommand}
│  source ${rcFile}
└─────────────────────────────────────────────────────────────┘`;

    ctx.log(guidance);

    // VSCode通知でも表示
    vscode.window.showInformationMessage(
        '🛠️ maidctl CLI を使用するには PATH を設定してください。詳細は出力パネルを確認してください。',
        'PATHの設定方法を表示'
    ).then(selection => {
        if (selection === 'PATHの設定方法を表示') {
            vscode.window.showInformationMessage(
                `以下のコマンドを実行してください:\n\n${pathCommand}\nsource ${rcFile}`,
                { modal: true }
            );
        }
    });
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
