import { describe, it, expect, vi, beforeEach } from 'vitest';

// fs モック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// vscode モック
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

// environment モック
vi.mock('../../utils/environment', () => ({
  CURRENT_ENV: 'wsl',
  windowsToWslPath: vi.fn((p: string) => p),
}));

import * as fs from 'fs';
import * as vscode from 'vscode';
import { generateMcpJson, checkAndUpdateMcpJsonPath } from '../mcp-claude-setup';

const mockCtx = {
  workspaceRoot: '/mnt/c/Users/test/project',
  log: vi.fn(),
};

describe('generateMcpJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新規生成時に ${CLAUDE_PROJECT_DIR} を使用する', async () => {
    // .mcp.json が存在しない → 新規作成
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await generateMcpJson(mockCtx as any);

    // writeFileSync が1回呼ばれたことを検証
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(filePath).toContain('.mcp.json');

    // JSON内容を検証
    const config = JSON.parse(content as string);
    expect(config.mcpServers['maid-agent-messenger'].headers['X-Maid-Project-Path'])
      .toBe('${CLAUDE_PROJECT_DIR}');
  });

  it('既存のハードコードパスを検出して更新を提案する', async () => {
    const existingConfig = {
      mcpServers: {
        'maid-agent-messenger': {
          type: 'http',
          url: 'http://localhost:3100/mcp',
          headers: { 'X-Maid-Project-Path': '/old/hardcoded/path' },
        },
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('更新する' as any);

    await generateMcpJson(mockCtx as any);

    // 更新ダイアログが表示されたことを検証
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('${CLAUDE_PROJECT_DIR}'),
      '更新する',
      'スキップ'
    );

    // ${CLAUDE_PROJECT_DIR} に更新されたことを検証
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updatedConfig = JSON.parse(content as string);
    expect(updatedConfig.mcpServers['maid-agent-messenger'].headers['X-Maid-Project-Path'])
      .toBe('${CLAUDE_PROJECT_DIR}');
  });

  it('既に ${CLAUDE_PROJECT_DIR} を使用している場合はスキップする (generateMcpJson)', async () => {
    const existingConfig = {
      mcpServers: {
        'maid-agent-messenger': {
          type: 'http',
          url: 'http://localhost:3100/mcp',
          headers: { 'X-Maid-Project-Path': '${CLAUDE_PROJECT_DIR}' },
        },
      },
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));

    await generateMcpJson(mockCtx as any);

    // ダイアログは表示されない
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    // ファイル書き込みもされない
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('checkAndUpdateMcpJsonPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeConfig = (headerPath: string) => ({
    mcpServers: {
      'maid-agent-messenger': {
        type: 'http',
        url: 'http://127.0.0.1:3100/mcp',
        headers: { 'X-Maid-Project-Path': headerPath },
      },
    },
  });

  it('.mcp.json が存在しない場合は何もしない', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('既に ${CLAUDE_PROJECT_DIR} を使用している場合は何もしない', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('${CLAUDE_PROJECT_DIR}')));

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('ハードコードパス=現在のワークスペースでダイアログが表示される', async () => {
    // mockCtx.workspaceRoot と一致するパス
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/mnt/c/Users/test/project')));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('スキップ' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    // ダイアログが表示されること（バグ修正の核心）
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('${CLAUDE_PROJECT_DIR}'),
      expect.any(String),
      'スキップ'
    );
  });

  it('一致パスで「更新」選択時に ${CLAUDE_PROJECT_DIR} に書き換えられる', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/mnt/c/Users/test/project')));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('${CLAUDE_PROJECT_DIR} に更新' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updated = JSON.parse(content as string);
    expect(updated.mcpServers['maid-agent-messenger'].headers['X-Maid-Project-Path'])
      .toBe('${CLAUDE_PROJECT_DIR}');
  });

  it('一致パスで「スキップ」選択時にファイル変更なし', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/mnt/c/Users/test/project')));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('スキップ' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('不一致パスで3択ダイアログが表示される', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/old/different/path')));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('スキップ' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('/old/different/path'),
      '${CLAUDE_PROJECT_DIR} に更新',
      '現在のパスに更新',
      'スキップ'
    );
  });

  it('不一致パスで「${CLAUDE_PROJECT_DIR} に更新」選択時に書き換えられる', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/old/different/path')));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('${CLAUDE_PROJECT_DIR} に更新' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updated = JSON.parse(content as string);
    expect(updated.mcpServers['maid-agent-messenger'].headers['X-Maid-Project-Path'])
      .toBe('${CLAUDE_PROJECT_DIR}');
  });

  it('不一致パスで「現在のパスに更新」選択時にexpectedPathに書き換えられる', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/old/different/path')));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('現在のパスに更新' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updated = JSON.parse(content as string);
    expect(updated.mcpServers['maid-agent-messenger'].headers['X-Maid-Project-Path'])
      .toBe('/mnt/c/Users/test/project');
  });

  it('不一致パスで「スキップ」選択時にファイル変更なし', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeConfig('/old/different/path')));
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('スキップ' as any);

    await checkAndUpdateMcpJsonPath(mockCtx as any);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
