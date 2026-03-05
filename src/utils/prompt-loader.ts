/**
 * システムプロンプトファイルの読み込みユーティリティ
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** テンプレート変数の型定義 */
interface TemplateVariables {
    AGENT_ID: string;
    MAID_NAME: string;
}

/**
 * 指示書とペルソナを結合してシステムプロンプトファイルを生成
 *
 * @param maidAgentPath - .maid-agent ディレクトリのパス
 * @param agentId - エージェントID (butler, chief, emma, etc.)
 * @param role - 役割 (butler, chiefMaid, maid)
 * @param maidName - メイド名（メイドの場合のみ）
 * @returns 生成した一時ファイルのパス
 */
export function generateSystemPromptFile(
    maidAgentPath: string,
    agentId: string,
    role: 'butler' | 'chiefMaid' | 'maid',
    maidName?: string
): string {
    // 1. 指示書のパスを決定
    const instructionFileName = role === 'chiefMaid' ? 'chief.md' : `${role}.md`;
    const instructionPath = path.join(
        maidAgentPath, 'agents', 'instructions', instructionFileName
    );

    // 2. ペルソナのパスを決定
    const personaFileName = role === 'chiefMaid' ? 'chief.md' :
                           role === 'butler' ? 'butler.md' : `${agentId}.md`;
    const personaPath = path.join(
        maidAgentPath, 'agents', 'personas', personaFileName
    );

    // 3. ファイル読み込み
    let instructionContent = '';
    let personaContent = '';

    try {
        instructionContent = fs.readFileSync(instructionPath, 'utf-8');
    } catch (error) {
        console.error(`[prompt-loader] 指示書読み込みエラー: ${instructionPath}`);
        // フォールバック: 空文字列で続行
    }

    try {
        personaContent = fs.readFileSync(personaPath, 'utf-8');
    } catch (error) {
        console.error(`[prompt-loader] ペルソナ読み込みエラー: ${personaPath}`);
        // フォールバック: 空文字列で続行
    }

    // 4. テンプレート変数の置換（メイドの場合）
    if (role === 'maid') {
        const variables: TemplateVariables = {
            AGENT_ID: agentId,
            MAID_NAME: maidName || agentId,
        };
        instructionContent = replaceTemplateVariables(instructionContent, variables);
    }

    // 5. 結合
    const combinedContent = `${instructionContent}\n\n---\n\n${personaContent}`;

    // 6. 一時ファイルに書き出し
    const tempDir = os.tmpdir();
    const tempFileName = `maid-agent-prompt-${agentId}-${Date.now()}.md`;
    const tempFilePath = path.join(tempDir, tempFileName);

    fs.writeFileSync(tempFilePath, combinedContent, 'utf-8');

    return tempFilePath;
}

/**
 * テンプレート変数を置換
 */
function replaceTemplateVariables(
    content: string,
    variables: TemplateVariables
): string {
    return content
        .replace(/\{\{AGENT_ID\}\}/g, variables.AGENT_ID)
        .replace(/\{\{MAID_NAME\}\}/g, variables.MAID_NAME);
}

/**
 * 一時ファイルを削除（オプション）
 */
export function cleanupTempFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath) && filePath.includes('maid-agent-prompt-')) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        // 削除失敗は無視（OSが後でクリーンアップする）
    }
}
