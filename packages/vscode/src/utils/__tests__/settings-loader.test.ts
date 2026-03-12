import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadSettings, getModelForAgent, MaidAgentSettings } from '../settings-loader';

describe('settings-loader', () => {
    let tmpDir: string;
    let maidAgentPath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-loader-test-'));
        maidAgentPath = tmpDir;
        const configDir = path.join(tmpDir, 'system', 'config');
        fs.mkdirSync(configDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeSettings(content: string): void {
        const settingsPath = path.join(maidAgentPath, 'system', 'config', 'settings.yaml');
        fs.writeFileSync(settingsPath, content);
    }

    describe('loadSettings', () => {
        it('settings.yaml を正しくパースすること', () => {
            writeSettings(`
language: ja
model:
  default: "sonnet"
  roles:
    butler: "opus"
    chief: "sonnet"
    maid: "haiku"
  agents:
    emma: "opus"
`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.language).toBe('ja');
            expect(settings.model?.default).toBe('sonnet');
            expect(settings.model?.roles?.butler).toBe('opus');
            expect(settings.model?.roles?.chief).toBe('sonnet');
            expect(settings.model?.roles?.maid).toBe('haiku');
            expect(settings.model?.agents?.emma).toBe('opus');
        });

        it('model セクションが省略された場合、model が undefined であること', () => {
            writeSettings(`
language: ja
`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.language).toBe('ja');
            expect(settings.model).toBeUndefined();
        });

        it('settings.yaml が存在しない場合、デフォルト設定を返すこと', () => {
            // ファイルを作成しない
            fs.rmSync(path.join(maidAgentPath, 'system', 'config'), { recursive: true });
            const settings = loadSettings(maidAgentPath);
            expect(settings.language).toBe('ja');
            expect(settings.model).toBeUndefined();
        });

        it('不正な YAML の場合、デフォルト設定を返すこと', () => {
            writeSettings(':::invalid yaml:::');
            const settings = loadSettings(maidAgentPath);
            expect(settings.language).toBe('ja');
        });
    });

    describe('getModelForAgent', () => {
        it('エージェント個別指定が最優先であること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    default: 'haiku',
                    roles: { maid: 'sonnet' },
                    agents: { emma: 'opus' },
                },
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBe('opus');
        });

        it('エージェント個別指定がない場合、役割別が使われること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    default: 'haiku',
                    roles: { maid: 'sonnet' },
                },
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBe('sonnet');
        });

        it('役割別もない場合、グローバルデフォルトが使われること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    default: 'haiku',
                },
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBe('haiku');
        });

        it('グローバルデフォルトもない場合、undefined を返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {},
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBeUndefined();
        });

        it('model セクション自体がない場合、undefined を返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBeUndefined();
        });

        it('settings が undefined の場合、undefined を返すこと', () => {
            expect(getModelForAgent(undefined, 'emma', 'maid')).toBeUndefined();
        });

        it('役割名 chiefMaid を chief にマッピングすること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    roles: { chief: 'opus' },
                },
            };
            expect(getModelForAgent(settings, 'chief', 'chiefMaid')).toBe('opus');
        });

        it('役割名 butler を正しく解決すること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    roles: { butler: 'opus' },
                },
            };
            expect(getModelForAgent(settings, 'butler', 'butler')).toBe('opus');
        });

        it('フルネームモデル指定を受け付けること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                model: {
                    default: 'claude-opus-4-6',
                },
            };
            expect(getModelForAgent(settings, 'emma', 'maid')).toBe('claude-opus-4-6');
        });
    });
});
