import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext, RuleModuleMeta, SkillMeta } from '../types';
import { getGlobalMaidAgentPath } from '../utils/helpers';

/**
 * Markdown ファイルの frontmatter を解析
 * 純粋関数（ctx不要）
 */
export function parseMarkdownFrontmatter(filePath: string): Record<string, unknown> | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);

        if (!match) return null;

        const frontmatter = match[1];
        const result: Record<string, unknown> = {};

        // 簡易YAML解析
        const lines = frontmatter.split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                let value: unknown = line.substring(colonIndex + 1).trim();

                // 配列の解析 [a, b, c]
                if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
                    value = value.slice(1, -1).split(',').map(s => s.trim());
                }
                // booleanの解析
                else if (value === 'true') value = true;
                else if (value === 'false') value = false;

                result[key] = value;
            }
        }

        return result;
    } catch {
        return null;
    }
}

/**
 * グローバルルールのメタデータを読み込み
 */
export function parseRuleModules(ctx: SetupContext): RuleModuleMeta[] {
    const globalPath = ctx.globalMaidAgentPath;
    const rulesPath = path.join(globalPath, 'rules');
    const rules: RuleModuleMeta[] = [];

    if (!fs.existsSync(rulesPath)) {
        return rules;
    }

    const roleTypes: ('common' | 'butler' | 'chief' | 'maid')[] = ['common', 'butler', 'chief', 'maid'];

    for (const role of roleTypes) {
        const rolePath = path.join(rulesPath, role);
        if (!fs.existsSync(rolePath)) continue;

        const files = fs.readdirSync(rolePath).filter(f => f.endsWith('.md') && f !== 'README.md');

        for (const file of files) {
            const filePath = path.join(rolePath, file);
            const meta = parseMarkdownFrontmatter(filePath);

            if (meta) {
                rules.push({
                    name: (meta.name as string) || file.replace('.md', ''),
                    description: (meta.description as string) || '',
                    auto_select: meta.auto_select === true,
                    target_roles: (meta.target_roles as RuleModuleMeta['target_roles']) || [role],
                    filePath
                });
            }
        }
    }

    return rules;
}

/**
 * グローバルスキルのメタデータを読み込み
 */
export function parseGlobalSkills(ctx: SetupContext): SkillMeta[] {
    const globalPath = ctx.globalMaidAgentPath;
    const skillsPath = path.join(globalPath, 'skills');
    const skills: SkillMeta[] = [];

    if (!fs.existsSync(skillsPath)) {
        return skills;
    }

    const items = fs.readdirSync(skillsPath);

    for (const item of items) {
        const itemPath = path.join(skillsPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            // フォルダ形式のスキル（SKILL.md を含む）
            const skillMdPath = path.join(itemPath, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
                const meta = parseMarkdownFrontmatter(skillMdPath);
                skills.push({
                    name: (meta?.name as string) || item,
                    description: (meta?.description as string) || '',
                    auto_select: meta?.auto_select === true,
                    filePath: itemPath
                });
            }
        } else if (item.endsWith('.md') && item !== 'README.md') {
            // 単一ファイル形式のスキル
            const meta = parseMarkdownFrontmatter(itemPath);
            skills.push({
                name: (meta?.name as string) || item.replace('.md', ''),
                description: (meta?.description as string) || '',
                auto_select: meta?.auto_select === true,
                filePath: itemPath
            });
        }
    }

    return skills;
}

/**
 * ルール選択UIを表示
 */
export async function showRuleSelectionUI(rules: RuleModuleMeta[]): Promise<RuleModuleMeta[]> {
    const items = rules.map(rule => ({
        label: rule.name,
        description: rule.description,
        detail: `対象: ${rule.target_roles.join(', ')}`,
        picked: rule.auto_select,
        rule
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'グローバルルールを選択（ESCでスキップ）',
        title: '📋 グローバルルールの追加'
    });

    return selected?.map(item => item.rule) || [];
}

/**
 * スキル選択UIを表示
 */
export async function showSkillSelectionUI(skills: SkillMeta[]): Promise<SkillMeta[]> {
    const items = skills.map(skill => ({
        label: skill.name,
        description: skill.description,
        picked: skill.auto_select,
        skill
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'グローバルスキルを選択（ESCでスキップ）',
        title: '📚 グローバルスキルの追加'
    });

    return selected?.map(item => item.skill) || [];
}

/**
 * 選択されたルールをプロジェクトにコピー
 */
export async function copySelectedRules(ctx: SetupContext, rules: RuleModuleMeta[], maidAgentPath: string): Promise<void> {
    const rulesDestPath = path.join(maidAgentPath, 'agents', 'rules');

    // rules フォルダがなければ作成
    if (!fs.existsSync(rulesDestPath)) {
        fs.mkdirSync(rulesDestPath, { recursive: true });
    }

    for (const rule of rules) {
        const fileName = path.basename(rule.filePath);

        // 各ターゲットロールのフォルダにコピー
        for (const role of rule.target_roles) {
            const roleDestPath = path.join(rulesDestPath, role);
            if (!fs.existsSync(roleDestPath)) {
                fs.mkdirSync(roleDestPath, { recursive: true });
            }

            const destPath = path.join(roleDestPath, fileName);
            fs.copyFileSync(rule.filePath, destPath);
        }

        ctx.log(`[グローバル] ルールをコピー: ${rule.name}`);
    }
}

/**
 * 選択されたスキルをプロジェクトにコピー
 * copyDirectorySyncはMultiAgentControllerのメソッドを使用するため、
 * 将来的にworkspace-initializer.tsに移動される想定
 */
export async function copySelectedSkills(ctx: SetupContext, skills: SkillMeta[], maidAgentPath: string, copyDirectorySync: (src: string, dest: string) => void): Promise<void> {
    const skillsDestPath = path.join(maidAgentPath, 'agents', 'skills');

    for (const skill of skills) {
        const stat = fs.statSync(skill.filePath);

        if (stat.isDirectory()) {
            // フォルダごとコピー
            const destPath = path.join(skillsDestPath, path.basename(skill.filePath));
            copyDirectorySync(skill.filePath, destPath);
        } else {
            // 単一ファイルをコピー
            const destPath = path.join(skillsDestPath, path.basename(skill.filePath));
            fs.copyFileSync(skill.filePath, destPath);
        }

        ctx.log(`[グローバル] スキルをコピー: ${skill.name}`);
    }
}

/**
 * プロジェクトのルールをグローバルに昇格
 * initializeGlobalSettingsはMultiAgentControllerのメソッドを使用するため、
 * 将来的にworkspace-initializer.tsに移動される想定
 */
export async function promoteRuleToGlobal(ctx: SetupContext, initializeGlobalSettings: () => Promise<boolean>): Promise<void> {
    if (!ctx.maidAgentPath) {
        vscode.window.showWarningMessage('ワークスペースが初期化されていません');
        return;
    }

    const projectRulesPath = path.join(ctx.maidAgentPath, 'agents', 'rules');
    if (!fs.existsSync(projectRulesPath)) {
        vscode.window.showWarningMessage('プロジェクトに agents/rules フォルダがありません');
        return;
    }

    const globalPath = getGlobalMaidAgentPath();
    const globalRulesPath = path.join(globalPath, 'rules');

    // グローバルフォルダが存在しない場合は作成
    if (!fs.existsSync(globalRulesPath)) {
        await initializeGlobalSettings();
    }

    // プロジェクトのルールファイルを収集
    const roleTypes = ['common', 'butler', 'chief', 'maid'];
    const projectRules: { name: string; role: string; filePath: string }[] = [];
    const globalExisting = new Set<string>();

    // グローバルに既に存在するファイル名を収集
    for (const role of roleTypes) {
        const globalRolePath = path.join(globalRulesPath, role);
        if (fs.existsSync(globalRolePath)) {
            const files = fs.readdirSync(globalRolePath);
            files.forEach(f => globalExisting.add(`${role}/${f}`));
        }
    }

    // プロジェクトのルールを収集（グローバルに存在しないもののみ）
    for (const role of roleTypes) {
        const projectRolePath = path.join(projectRulesPath, role);
        if (fs.existsSync(projectRolePath)) {
            const files = fs.readdirSync(projectRolePath);
            for (const file of files) {
                if (file.endsWith('.md') && file !== 'README.md' && file !== 'rule-template.md') {
                    const key = `${role}/${file}`;
                    if (!globalExisting.has(key)) {
                        projectRules.push({
                            name: file.replace('.md', ''),
                            role,
                            filePath: path.join(projectRolePath, file)
                        });
                    }
                }
            }
        }
    }

    if (projectRules.length === 0) {
        vscode.window.showInformationMessage('昇格可能なルールがありません（全てグローバル化済み、またはルールなし）');
        return;
    }

    // 選択UI
    const items = projectRules.map(rule => ({
        label: rule.name,
        description: `[${rule.role}]`,
        detail: rule.filePath,
        rule
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'グローバルに昇格するルールを選択',
        title: '📋 ルールをグローバルに昇格'
    });

    if (!selected || selected.length === 0) {
        return;
    }

    // コピー実行
    for (const item of selected) {
        const globalRolePath = path.join(globalRulesPath, item.rule.role);
        if (!fs.existsSync(globalRolePath)) {
            fs.mkdirSync(globalRolePath, { recursive: true });
        }

        const destPath = path.join(globalRolePath, path.basename(item.rule.filePath));
        fs.copyFileSync(item.rule.filePath, destPath);
        ctx.log(`[グローバル] ルールを昇格: ${item.rule.name} → ${item.rule.role}/`);
    }

    vscode.window.showInformationMessage(`🌐 ${selected.length}個のルールをグローバルに昇格しました`);
}
