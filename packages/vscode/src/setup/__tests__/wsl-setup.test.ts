import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// child_process モック
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// vscode モック
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
    })),
  },
}));

// environment モック
vi.mock('../../utils/environment', () => ({
  CURRENT_ENV: 'windows-native',
  ENV: {
      platform: 'windows-native',
      isWindowsNative: () => true,
      isWsl: () => false,
      isMacOS: () => false,
      isPsmux: (mode?: string) => mode === 'windows-native',
      getMultiplexerCommand: (mode?: string) => mode === 'windows-native' ? 'psmux' : 'wsl tmux',
      windowsToWslPath: (p: string) => p,
      normalizePathForServer: (p: string) => p,
      needsWslPrefix: (mode?: string) => mode !== 'windows-native',
  },
}));

// requirements-analyzer モック（checkJqInstalledSimple）
vi.mock('../requirements-analyzer', () => ({
  checkJqInstalledSimple: vi.fn(),
}));

import * as vscode from 'vscode';
import { checkAndInstallJq } from '../wsl-setup';
import { checkJqInstalledSimple } from '../requirements-analyzer';

const mockCtx = {
  workspaceRoot: '/test/workspace',
  log: vi.fn(),
};

// checkJqInstalled は requirements-analyzer.checkJqInstalledSimple に統一済み（Phase 8）
// テストは requirements-analyzer.test.ts に移行

describe('checkAndInstallJq', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('jq がインストール済みの場合は即座に true を返す', async () => {
    vi.mocked(checkJqInstalledSimple).mockReturnValue(true);

    const result = await checkAndInstallJq(mockCtx as any);

    expect(result).toBe(true);
    expect(mockCtx.log).toHaveBeenCalledWith('[jq] インストール済み');
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('jq が未インストールで「スキップ」選択時は false を返す', async () => {
    // 最初のチェックで jq が見つからない
    vi.mocked(checkJqInstalledSimple).mockReturnValue(false);
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('スキップ' as any);

    const result = await checkAndInstallJq(mockCtx as any);

    expect(result).toBe(false);
    expect(mockCtx.log).toHaveBeenCalledWith('[jq] インストールをスキップ');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('jq がインストールされていません')
    );
  });

  it('jq が未インストールでダイアログが閉じられた場合は false を返す', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('jq not found');
    });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any);

    const result = await checkAndInstallJq(mockCtx as any);

    expect(result).toBe(false);
  });

  it('インストール確認ダイアログに正しいメッセージが表示される', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('jq not found');
    });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('スキップ' as any);

    await checkAndInstallJq(mockCtx as any);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('jq (JSONパーサー)'),
      expect.any(Object),
      'インストールする',
      'スキップ'
    );
  });
});
