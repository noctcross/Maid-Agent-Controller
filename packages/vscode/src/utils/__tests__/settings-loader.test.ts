import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadSettings, getModelForAgent, getProviderEnvVars, MaidAgentSettings } from '../settings-loader';

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

        it('パースエラーが発生した場合、console.error を出力すること', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            // 閉じられていないフローシーケンス — yaml ライブラリが例外をスロー
            writeSettings('key: [\nunclosed: true');
            loadSettings(maidAgentPath);
            expect(errorSpy).toHaveBeenCalledOnce();
            expect(errorSpy.mock.calls[0][0]).toContain('[Settings]');
            errorSpy.mockRestore();
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

    describe('loadSettings (provider セクション)', () => {
        it('provider.type: bedrock を正しくパースすること', () => {
            writeSettings(`
language: ja
provider:
  type: bedrock
  bedrock:
    region: us-east-1
    profile: myprofile
    base_url: https://custom.bedrock.example.com
`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.provider?.type).toBe('bedrock');
            expect(settings.provider?.bedrock?.region).toBe('us-east-1');
            expect(settings.provider?.bedrock?.profile).toBe('myprofile');
            expect(settings.provider?.bedrock?.base_url).toBe('https://custom.bedrock.example.com');
        });

        it('provider.type: vertex を正しくパースすること', () => {
            writeSettings(`
language: ja
provider:
  type: vertex
  vertex:
    project_id: my-gcp-project
    region: us-central1
`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.provider?.type).toBe('vertex');
            expect(settings.provider?.vertex?.project_id).toBe('my-gcp-project');
            expect(settings.provider?.vertex?.region).toBe('us-central1');
        });

        it('provider.type: custom を正しくパースすること', () => {
            writeSettings(`
language: ja
provider:
  type: custom
  custom:
    base_url: https://gateway.example.com/v1
    auth_token_env: MY_GATEWAY_TOKEN
`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.provider?.type).toBe('custom');
            expect(settings.provider?.custom?.base_url).toBe('https://gateway.example.com/v1');
            expect(settings.provider?.custom?.auth_token_env).toBe('MY_GATEWAY_TOKEN');
        });

        it('provider セクションが省略された場合、provider が undefined であること', () => {
            writeSettings(`language: ja\n`);
            const settings = loadSettings(maidAgentPath);
            expect(settings.provider).toBeUndefined();
        });
    });

    describe('getProviderEnvVars', () => {
        it('settings が undefined の場合、空オブジェクトを返すこと', () => {
            expect(getProviderEnvVars(undefined)).toEqual({});
        });

        it('provider が未設定の場合、空オブジェクトを返すこと', () => {
            const settings: MaidAgentSettings = { language: 'ja' };
            expect(getProviderEnvVars(settings)).toEqual({});
        });

        it('type: anthropic の場合、空オブジェクトを返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: { type: 'anthropic' },
            };
            expect(getProviderEnvVars(settings)).toEqual({});
        });

        it('type: bedrock の場合、Bedrock 環境変数を返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'bedrock',
                    bedrock: { region: 'us-east-1' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['CLAUDE_CODE_USE_BEDROCK']).toBe('1');
            expect(envVars['AWS_REGION']).toBe('us-east-1');
        });

        it('type: bedrock + profile の場合、AWS_PROFILE も含まれること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'bedrock',
                    bedrock: { region: 'ap-northeast-1', profile: 'sso-profile' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['AWS_PROFILE']).toBe('sso-profile');
        });

        it('type: bedrock + base_url の場合、ANTHROPIC_BEDROCK_BASE_URL も含まれること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'bedrock',
                    bedrock: { region: 'us-east-1', base_url: 'https://custom.bedrock.example.com' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['ANTHROPIC_BEDROCK_BASE_URL']).toBe('https://custom.bedrock.example.com');
        });

        it('type: vertex の場合、Vertex AI 環境変数を返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'vertex',
                    vertex: { project_id: 'my-project', region: 'global' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['CLAUDE_CODE_USE_VERTEX']).toBe('1');
            expect(envVars['ANTHROPIC_VERTEX_PROJECT_ID']).toBe('my-project');
            expect(envVars['CLOUD_ML_REGION']).toBe('global');
        });

        it('type: vertex + base_url の場合、ANTHROPIC_VERTEX_BASE_URL も含まれること', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'vertex',
                    vertex: { project_id: 'my-project', region: 'us-central1', base_url: 'https://custom.vertex.example.com' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['ANTHROPIC_VERTEX_BASE_URL']).toBe('https://custom.vertex.example.com');
        });

        it('type: custom の場合、ANTHROPIC_BASE_URL を返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'custom',
                    custom: { base_url: 'https://gateway.example.com/v1' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['ANTHROPIC_BASE_URL']).toBe('https://gateway.example.com/v1');
        });

        it('type: custom + auth_token_env の場合、環境変数から TOKEN を解決すること', () => {
            vi.stubEnv('MY_GATEWAY_TOKEN', 'secret-token-123');
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'custom',
                    custom: { base_url: 'https://gateway.example.com/v1', auth_token_env: 'MY_GATEWAY_TOKEN' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['ANTHROPIC_AUTH_TOKEN']).toBe('secret-token-123');
            vi.unstubAllEnvs();
        });

        it('type: custom + auth_token_env が未設定の場合、ANTHROPIC_AUTH_TOKEN を含まないこと', () => {
            vi.stubEnv('MY_MISSING_TOKEN', '');
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'custom',
                    custom: { base_url: 'https://gateway.example.com/v1', auth_token_env: 'MY_MISSING_TOKEN' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
            vi.unstubAllEnvs();
        });

        it('bedrock セクションが省略された場合、CLAUDE_CODE_USE_BEDROCK のみ返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: { type: 'bedrock' },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['CLAUDE_CODE_USE_BEDROCK']).toBe('1');
            expect(Object.keys(envVars)).toHaveLength(1);
        });

        // #473-5: エッジケーステスト追加
        it('type: custom で base_url が未設定の場合、空オブジェクトを返し console.warn を出力すること', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: { type: 'custom', custom: {} },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars).toEqual({});
            expect(warnSpy).toHaveBeenCalledOnce();
            expect(warnSpy.mock.calls[0][0]).toContain('[Provider]');
            warnSpy.mockRestore();
        });

        it('type: vertex で project_id のみ指定（region 省略）の場合、region なしで返すこと', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'vertex',
                    vertex: { project_id: 'my-project' },
                },
            };
            const envVars = getProviderEnvVars(settings);
            expect(envVars['CLAUDE_CODE_USE_VERTEX']).toBe('1');
            expect(envVars['ANTHROPIC_VERTEX_PROJECT_ID']).toBe('my-project');
            expect(envVars['CLOUD_ML_REGION']).toBeUndefined();
        });
    });
});
