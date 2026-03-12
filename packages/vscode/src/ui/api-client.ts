/**
 * APIクライアント管理
 *
 * 責務: MaidAgentClient のインスタンス管理
 */

import { MaidAgentClient } from '@maid-agent/api-client';

let client: MaidAgentClient | null = null;

/**
 * APIクライアントを取得
 *
 * baseUrl または projectPath が変更された場合は新しいインスタンスを作成
 */
export function getApiClient(baseUrl: string, projectPath: string): MaidAgentClient {
    if (!client || client.getBaseUrl() !== baseUrl || client.getProjectPath() !== projectPath) {
        client = new MaidAgentClient({ baseUrl, projectPath });
    }
    return client;
}

/**
 * APIクライアントをリセット
 *
 * テスト用または設定変更時に使用
 */
export function resetApiClient(): void {
    client = null;
}
