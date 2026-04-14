/**
 * agent-startup.ts の provider 環境変数注入テスト
 * #473 マルチプロバイダ対応
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCommandWithEnvVars } from '../../utils/shell-escape';

// buildClaudeCommand は内部関数のため、間接的に統合テストで検証する。
// ここでは getProviderEnvVars が buildCommandWithEnvVars に渡されるケースを
// settings-loader 経由のユニットテストとして確認する。

import { getProviderEnvVars } from '../../utils/settings-loader';
import type { MaidAgentSettings } from '../../utils/settings-loader';

describe('agent-startup provider env injection', () => {
    describe('getProviderEnvVars と buildCommandWithEnvVars の統合', () => {
        it('provider: bedrock の場合、Bedrock 環境変数がコマンドに含まれること (bash)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'bedrock',
                    bedrock: { region: 'ap-northeast-1' },
                },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, 'claude --dangerously-skip-permissions', 'bash');
            expect(command).toContain('CLAUDE_CODE_USE_BEDROCK=1');
            expect(command).toContain('AWS_REGION=ap-northeast-1');
        });

        it('provider: vertex の場合、Vertex AI 環境変数がコマンドに含まれること (bash)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'vertex',
                    vertex: { project_id: 'my-gcp-project', region: 'global' },
                },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, 'claude --dangerously-skip-permissions', 'bash');
            expect(command).toContain('CLAUDE_CODE_USE_VERTEX=1');
            expect(command).toContain('ANTHROPIC_VERTEX_PROJECT_ID=my-gcp-project');
            expect(command).toContain('CLOUD_ML_REGION=global');
        });

        it('provider: anthropic（デフォルト）の場合、余分な環境変数が含まれないこと (bash)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: { type: 'anthropic' },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, 'claude --dangerously-skip-permissions', 'bash');
            expect(command).not.toContain('CLAUDE_CODE_USE_BEDROCK');
            expect(command).not.toContain('CLAUDE_CODE_USE_VERTEX');
            expect(command).not.toContain('ANTHROPIC_BASE_URL');
            expect(command).toContain('CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1');
        });

        it('provider: bedrock の場合、PowerShell 形式でも環境変数が含まれること (powershell)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'bedrock',
                    bedrock: { region: 'us-east-1', profile: 'sso-prod' },
                },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, "& 'claude.exe' --dangerously-skip-permissions", 'powershell');
            expect(command).toContain('CLAUDE_CODE_USE_BEDROCK');
            expect(command).toContain('AWS_REGION');
            expect(command).toContain('AWS_PROFILE');
        });

        it('provider: custom の場合、ANTHROPIC_BASE_URL がコマンドに含まれること (bash)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'custom',
                    custom: { base_url: 'https://gateway.example.com/v1' },
                },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, 'claude --dangerously-skip-permissions', 'bash');
            expect(command).toContain('ANTHROPIC_BASE_URL=https://gateway.example.com/v1');
        });

        // #473-5: psmux 形式で custom type のエッジケース
        it('provider: custom の場合、ANTHROPIC_BASE_URL が PowerShell 形式でも含まれること (powershell)', () => {
            const settings: MaidAgentSettings = {
                language: 'ja',
                provider: {
                    type: 'custom',
                    custom: { base_url: 'https://gateway.example.com/v1' },
                },
            };
            const providerEnvVars = getProviderEnvVars(settings);
            const envVars = {
                CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
                ...providerEnvVars,
            };
            const command = buildCommandWithEnvVars(envVars, "& 'claude.exe' --dangerously-skip-permissions", 'powershell');
            expect(command).toContain('ANTHROPIC_BASE_URL');
            expect(command).toContain('gateway.example.com');
        });
    });
});
