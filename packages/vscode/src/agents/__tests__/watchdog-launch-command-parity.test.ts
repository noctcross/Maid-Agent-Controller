/**
 * watchdog.sh build_maid_launch_cmd vs agent-startup.ts buildBashClaudeCommand 乖離検知テスト
 *
 * 目的:
 * task-476 で watchdog の bash 関数は agent-startup.ts の buildBashClaudeCommand を
 * bash で再実装したもの。両者は独立コードのため将来の変更で乖離するリスクがある。
 * このテストで乖離を CI で検知する。
 *
 * 乖離の例:
 * - agent-startup.ts に --new-flag が追加されたが watchdog.sh が未更新
 * - 環境変数キーが変更されたが片方だけ更新
 * - --add-dir パスが変更された
 *
 * 修正が必要な場合:
 * 1. agent-startup.ts の buildBashClaudeCommand を変更
 * 2. watchdog.sh の build_maid_launch_cmd を同様に変更
 * 3. このファイルの LAUNCH_CMD_SPEC / テストケースを更新
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// agent-startup.ts が vscode に依存するため、テスト環境でモックが必要
vi.mock('vscode', () => ({
    window: {
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
        createOutputChannel: vi.fn().mockReturnValue({ appendLine: vi.fn(), show: vi.fn() }),
    },
}));

import { buildBashClaudeCommand } from '../agent-startup.js';
import { getModelForAgent, getProviderEnvVars, loadSettings } from '../../utils/settings-loader.js';
import type { MaidAgentSettings } from '../../utils/settings-loader.js';

// watchdog.sh のパス（テストファイルから6階層上がって MaidsHouse ルートへ）
// __dirname: packages/vscode/src/agents/__tests__
// MAIDS_HOUSE_ROOT 環境変数で上書き可能（git worktree からのテスト実行時に使用）
const MAIDS_HOUSE_ROOT = process.env['MAIDS_HOUSE_ROOT'] ?? path.resolve(__dirname, '../../../../../../');
const WATCHDOG_PATH = path.join(MAIDS_HOUSE_ROOT, '.maid-agent/system/bin/watchdog.sh');
const REAL_MAID_AGENT_PATH = path.join(MAIDS_HOUSE_ROOT, '.maid-agent');

// =============================================================================
// 起動コマンドのスペック定義
//
// 【重要】agent-startup.ts の buildBashClaudeCommand を変更する場合は
// このスペックも同時に更新し、watchdog.sh との整合性を確認すること。
// =============================================================================

/** 起動コマンドに含まれなければならない要素 */
const LAUNCH_CMD_SPEC = {
    /** 必須環境変数プレフィックス（export 形式） */
    requiredEnvVarPrefix: 'export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1',
    /** Git Author/Committer 環境変数（agentId から導出） */
    gitAuthorEnvVar: (agentId: string) => `GIT_AUTHOR_NAME=${agentId}`,
    gitAuthorEmailEnvVar: (agentId: string) => `GIT_AUTHOR_EMAIL=${agentId}@maid-agent.local`,
    gitCommitterEnvVar: (agentId: string) => `GIT_COMMITTER_NAME=${agentId}`,
    gitCommitterEmailEnvVar: (agentId: string) => `GIT_COMMITTER_EMAIL=${agentId}@maid-agent.local`,
    /** CODELODIS_AGENT_ID 環境変数（agentId と一致） */
    codelodisAgentIdEnvVar: (agentId: string) => `CODELODIS_AGENT_ID=${agentId}`,
    /** 必須フラグ */
    requiredFlags: [
        '--dangerously-skip-permissions',
        '--add-dir .maid-agent/core',
    ],
    /** エージェントIDを含む --add-dir */
    agentDirFlag: (agentId: string) => `--add-dir .maid-agent/roles/${agentId}`,
    /** モデルフラグ（モデルが設定されている場合） */
    modelFlag: (model: string) => `--model ${model}`,
} as const;

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * TypeScript 側の起動コマンドを組み立てる
 * buildBashClaudeCommand + getModelForAgent + getProviderEnvVars を組み合わせる
 */
function buildTsLaunchCommand(
    settings: MaidAgentSettings,
    agentId: string,
    role: string,
    initialPrompt?: string,
): string {
    const model = getModelForAgent(settings, agentId, role);
    const modelFlag = model ? ` --model ${model}` : '';
    const providerEnvVars = getProviderEnvVars(settings, agentId, role);
    const envVars = {
        CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
        CODELODIS_AGENT_ID: agentId,
        GIT_AUTHOR_NAME: agentId,
        GIT_AUTHOR_EMAIL: `${agentId}@maid-agent.local`,
        GIT_COMMITTER_NAME: agentId,
        GIT_COMMITTER_EMAIL: `${agentId}@maid-agent.local`,
        ...providerEnvVars,
    };
    return buildBashClaudeCommand(agentId, modelFlag, envVars, initialPrompt);
}

/**
 * bash 側の起動コマンドを取得する（watchdog.sh --get-launch-cmd 経由）
 */
function getBashLaunchCommand(agentId: string, settingsFilePath?: string): string {
    const env = settingsFilePath
        ? { ...process.env, WATCHDOG_SETTINGS_FILE: settingsFilePath }
        : process.env;

    return execSync(`${WATCHDOG_PATH} --get-launch-cmd ${agentId}`, {
        encoding: 'utf-8',
        env,
        cwd: MAIDS_HOUSE_ROOT,
    }).trim();
}

/** ユニークファイル名用カウンター */
let _tempFileCounter = 0;

/**
 * テスト用 settings.yaml を home ディレクトリに書き込む
 * （snap yq は /tmp にアクセスできないため home を使用）
 * 各呼び出しごとにユニークなファイル名を生成する
 */
function writeTempSettings(content: string): string {
    const filePath = path.join(
        os.homedir(),
        `watchdog-parity-test-${process.pid}-${_tempFileCounter++}.yaml`,
    );
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

// =============================================================================
// スペックテスト: TypeScript 側の出力検証
// =============================================================================

describe('launch command spec (TypeScript side)', () => {
    const settings: MaidAgentSettings = {
        language: 'ja',
        model: {
            default: 'claude-default',
            roles: { butler: 'claude-opus', chief: 'claude-opus', maid: 'claude-sonnet' },
        },
    };

    it('export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 が先頭に含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.requiredEnvVarPrefix);
        // export 文はコマンドの先頭に来ること
        expect(cmd.indexOf('export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD')).toBeLessThan(
            cmd.indexOf('claude '),
        );
    });

    it('GIT_AUTHOR_NAME が agentId で含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitAuthorEnvVar('luna'));
    });

    it('GIT_AUTHOR_EMAIL が agentId@maid-agent.local で含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitAuthorEmailEnvVar('luna'));
    });

    it('GIT_COMMITTER_NAME が agentId で含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitCommitterEnvVar('luna'));
    });

    it('GIT_COMMITTER_EMAIL が agentId@maid-agent.local で含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitCommitterEmailEnvVar('luna'));
    });

    it('CODELODIS_AGENT_ID が agentId で含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.codelodisAgentIdEnvVar('luna'));
    });

    it('agentId が変わると GIT 環境変数も変わること', () => {
        const cmdLuna = buildTsLaunchCommand(settings, 'luna', 'maid');
        const cmdEmma = buildTsLaunchCommand(settings, 'emma', 'maid');
        expect(cmdLuna).toContain('GIT_AUTHOR_NAME=luna');
        expect(cmdEmma).toContain('GIT_AUTHOR_NAME=emma');
        expect(cmdLuna).not.toContain('GIT_AUTHOR_NAME=emma');
    });

    it('--dangerously-skip-permissions が含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain('--dangerously-skip-permissions');
    });

    it('--add-dir .maid-agent/core が含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain('--add-dir .maid-agent/core');
    });

    it('--add-dir .maid-agent/roles/{agentId} が含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.agentDirFlag('luna'));
    });

    it('agentId が変わると --add-dir パスも変わること', () => {
        const cmdLuna = buildTsLaunchCommand(settings, 'luna', 'maid');
        const cmdEmma = buildTsLaunchCommand(settings, 'emma', 'maid');
        expect(cmdLuna).toContain('--add-dir .maid-agent/roles/luna');
        expect(cmdEmma).toContain('--add-dir .maid-agent/roles/emma');
        expect(cmdLuna).not.toContain('--add-dir .maid-agent/roles/emma');
    });

    it('model.roles.maid が --model フラグに反映されること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        expect(cmd).toContain(LAUNCH_CMD_SPEC.modelFlag('claude-sonnet'));
    });

    it('model.agents.{id} がロール設定より優先されること', () => {
        const overriddenSettings: MaidAgentSettings = {
            language: 'ja',
            model: {
                default: 'claude-default',
                roles: { maid: 'claude-sonnet' },
                agents: { luna: 'claude-haiku' },
            },
        };
        const cmd = buildTsLaunchCommand(overriddenSettings, 'luna', 'maid');
        expect(cmd).toContain('--model claude-haiku');
        expect(cmd).not.toContain('--model claude-sonnet');
    });

    it('model 未設定時は --model フラグが含まれないこと', () => {
        const noModelSettings: MaidAgentSettings = { language: 'ja' };
        const cmd = buildTsLaunchCommand(noModelSettings, 'luna', 'maid');
        expect(cmd).not.toContain('--model');
    });

    it('initialPrompt が指定された場合は -- に続いて含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid', 'テストプロンプトです');
        expect(cmd).toContain("-- 'テストプロンプトです'");
    });

    it('REQUIRED: すべての必須フラグが含まれること', () => {
        const cmd = buildTsLaunchCommand(settings, 'luna', 'maid');
        for (const flag of LAUNCH_CMD_SPEC.requiredFlags) {
            expect(cmd, `必須フラグ "${flag}" が含まれていません`).toContain(flag);
        }
    });
});

// =============================================================================
// スペックテスト: bash 側の出力検証
// =============================================================================

describe('launch command spec (bash watchdog.sh side)', () => {
    let tempSettingsPath: string;

    beforeAll(() => {
        // snap yq は /tmp にアクセスできないため home ディレクトリに書き込む
        tempSettingsPath = writeTempSettings(`
language: ja
model:
  default: claude-default
  roles:
    maid: claude-sonnet
`);
    });

    afterAll(() => {
        if (tempSettingsPath && fs.existsSync(tempSettingsPath)) {
            fs.unlinkSync(tempSettingsPath);
        }
    });

    it('export CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 が含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.requiredEnvVarPrefix);
    });

    it('GIT_AUTHOR_NAME が agentId で含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitAuthorEnvVar('luna'));
    });

    it('GIT_AUTHOR_EMAIL が agentId@maid-agent.local で含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitAuthorEmailEnvVar('luna'));
    });

    it('GIT_COMMITTER_NAME が agentId で含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitCommitterEnvVar('luna'));
    });

    it('GIT_COMMITTER_EMAIL が agentId@maid-agent.local で含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.gitCommitterEmailEnvVar('luna'));
    });

    it('CODELODIS_AGENT_ID が agentId で含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.codelodisAgentIdEnvVar('luna'));
    });

    it('--dangerously-skip-permissions が含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain('--dangerously-skip-permissions');
    });

    it('--add-dir .maid-agent/core が含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain('--add-dir .maid-agent/core');
    });

    it('--add-dir .maid-agent/roles/{agentId} が含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain(LAUNCH_CMD_SPEC.agentDirFlag('luna'));
    });

    it('model.roles.maid が --model フラグに反映されること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        expect(cmd).toContain('--model claude-sonnet');
    });

    it('model.agents.{id} がロール設定より優先されること', () => {
        const overridePath = writeTempSettings(`
language: ja
model:
  default: claude-default
  roles:
    maid: claude-sonnet
  agents:
    luna: claude-haiku
`);
        try {
            const cmd = getBashLaunchCommand('luna', overridePath);
            expect(cmd).toContain('--model claude-haiku');
            expect(cmd).not.toContain('--model claude-sonnet');
        } finally {
            fs.unlinkSync(overridePath);
        }
    });

    it('model 未設定時は --model フラグが含まれないこと', () => {
        const noModelPath = writeTempSettings(`language: ja\n`);
        try {
            const cmd = getBashLaunchCommand('luna', noModelPath);
            expect(cmd).not.toContain('--model');
        } finally {
            fs.unlinkSync(noModelPath);
        }
    });

    it('REQUIRED: すべての必須フラグが含まれること', () => {
        const cmd = getBashLaunchCommand('luna', tempSettingsPath);
        for (const flag of LAUNCH_CMD_SPEC.requiredFlags) {
            expect(cmd, `必須フラグ "${flag}" が含まれていません (bash側)`).toContain(flag);
        }
    });
});

// =============================================================================
// パリティテスト: TypeScript と bash の出力が一致すること
// =============================================================================

describe('TS vs bash parity (乖離検知)', () => {
    let tempSettingsPath: string;
    const PARITY_FIXTURES: Array<{ label: string; yaml: string; settings: MaidAgentSettings; agentId: string; role: string }> = [
        {
            label: 'maid role model (sonnet)',
            yaml: `language: ja\nmodel:\n  default: claude-default\n  roles:\n    maid: claude-sonnet\n`,
            settings: { language: 'ja', model: { default: 'claude-default', roles: { maid: 'claude-sonnet' } } },
            agentId: 'luna',
            role: 'maid',
        },
        {
            label: 'agent-specific model override (haiku)',
            yaml: `language: ja\nmodel:\n  default: claude-default\n  roles:\n    maid: claude-sonnet\n  agents:\n    luna: claude-haiku\n`,
            settings: { language: 'ja', model: { default: 'claude-default', roles: { maid: 'claude-sonnet' }, agents: { luna: 'claude-haiku' } } },
            agentId: 'luna',
            role: 'maid',
        },
        {
            label: 'no model config',
            yaml: `language: ja\n`,
            settings: { language: 'ja' },
            agentId: 'emma',
            role: 'maid',
        },
        {
            label: 'default model only',
            yaml: `language: ja\nmodel:\n  default: claude-opus-4\n`,
            settings: { language: 'ja', model: { default: 'claude-opus-4' } },
            agentId: 'alice',
            role: 'maid',
        },
    ];

    // 各フィクスチャの一時ファイルを beforeAll で作成し afterAll で削除
    const tempFiles: string[] = [];

    beforeAll(() => {
        for (const fixture of PARITY_FIXTURES) {
            const filePath = writeTempSettings(fixture.yaml);
            tempFiles.push(filePath);
        }
    });

    afterAll(() => {
        for (const f of tempFiles) {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        }
    });

    for (let i = 0; i < PARITY_FIXTURES.length; i++) {
        const fixture = PARITY_FIXTURES[i];
        it(`TypeScript と bash の出力が一致すること: ${fixture.label}`, () => {
            const tempFile = tempFiles[i];

            // TypeScript 側
            const tsCmd = buildTsLaunchCommand(fixture.settings, fixture.agentId, fixture.role);

            // bash 側
            const bashCmd = getBashLaunchCommand(fixture.agentId, tempFile);

            expect(
                bashCmd,
                `\n乖離検知: "${fixture.label}"\n` +
                `TypeScript: ${tsCmd}\n` +
                `bash:       ${bashCmd}\n` +
                `両者を一致させてください:\n` +
                `  agent-startup.ts の buildBashClaudeCommand\n` +
                `  watchdog.sh の build_maid_launch_cmd\n`,
            ).toBe(tsCmd);
        });
    }
});

// =============================================================================
// 実際の settings.yaml を使ったスモークテスト
// =============================================================================

describe('実際の settings.yaml を使ったスモークテスト', () => {
    it('実プロジェクトの設定で TS と bash が一致すること', () => {
        // 実際の設定ファイルが存在する場合のみ実行
        if (!fs.existsSync(path.join(REAL_MAID_AGENT_PATH, 'system/config/settings.yaml'))) {
            console.log('settings.yaml が見つかりません。スキップします。');
            return;
        }

        const realSettings = loadSettings(REAL_MAID_AGENT_PATH);

        // TypeScript 側
        const tsCmd = buildTsLaunchCommand(realSettings, 'luna', 'maid');

        // bash 側（WATCHDOG_SETTINGS_FILE 未指定 = 実際の settings.yaml を使用）
        const bashCmd = getBashLaunchCommand('luna');

        expect(
            bashCmd,
            `\n実際の settings.yaml での乖離:\nTS:   ${tsCmd}\nbash: ${bashCmd}\n`,
        ).toBe(tsCmd);
    });
});
