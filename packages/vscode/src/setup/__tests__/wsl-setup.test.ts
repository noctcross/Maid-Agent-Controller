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
      needsWslPrefix: (mode?: string) => mode !== 'windows-native',
  },
}));

import * as vscode from 'vscode';
import { checkJqInstalled, checkAndInstallJq } from '../wsl-setup';

const mockCtx = {
  workspaceRoot: '/test/workspace',
  log: vi.fn(),
};

describe('checkJqInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('jq がインストール済みの場合は true を返す', () => {
    vi.mocked(execSync).mockReturnValue('/usr/bin/jq\n');

    const result = checkJqInstalled(mockCtx as any);

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      'wsl bash -lc "which jq"',
      expect.any(Object)
    );
  });

  it('jq が未インストールの場合は false を返す', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('jq not found');
    });

    const result = checkJqInstalled(mockCtx as any);

    expect(result).toBe(false);
  });
});

describe('checkAndInstallJq', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('jq がインストール済みの場合は即座に true を返す', async () => {
    vi.mocked(execSync).mockReturnValue('/usr/bin/jq\n');

    const result = await checkAndInstallJq(mockCtx as any);

    expect(result).toBe(true);
    expect(mockCtx.log).toHaveBeenCalledWith('[jq] インストール済み');
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('jq が未インストールで「スキップ」選択時は false を返す', async () => {
    // 最初のチェックで jq が見つからない
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('jq not found');
    });
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
