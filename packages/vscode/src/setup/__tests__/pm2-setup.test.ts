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
    showInputBox: vi.fn(),
    withProgress: vi.fn(),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

// 環境変数モック（デフォルト: windows-native）
vi.mock('../../utils/environment', () => ({
  CURRENT_ENV: 'windows-native',
  windowsToWslPath: vi.fn((p: string) => p.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)),
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

// constants モック
vi.mock('../../constants', () => ({
  DASHBOARD_SERVER_URL: 'http://localhost:3100',
}));

// wsl-setup モック
vi.mock('../wsl-setup', () => ({
  checkPasswordlessSudo: vi.fn(() => false),
  setupPasswordlessSudo: vi.fn(),
  promptWslPassword: vi.fn(),
  showPasswordHelp: vi.fn(),
}));

// package-manager モック
vi.mock('../../utils/package-manager', () => ({
  detectPackageManager: vi.fn(() => 'npm'),
  PM_CONFIG: {
    npm: {
      displayName: 'npm',
      install: 'npm install',
      globalInstall: (pkg: string) => `npm install -g ${pkg}`,
    },
    yarn: {
      displayName: 'Yarn',
      install: 'yarn install',
      globalInstall: (pkg: string) => `yarn global add ${pkg}`,
    },
    pnpm: {
      displayName: 'pnpm',
      install: 'pnpm install',
      globalInstall: (pkg: string) => `pnpm add -g ${pkg}`,
    },
    bun: {
      displayName: 'Bun',
      install: 'bun install',
      globalInstall: (pkg: string) => `bun add -g ${pkg}`,
    },
  },
  PackageManager: {} as any,
}));

import {
  runShellCommand,
  checkPasswordlessSudoNative,
  getMessengerShellPath,
} from '../pm2-setup';
import * as environment from '../../utils/environment';

describe('pm2-setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runShellCommand', () => {
    it('Windows環境ではWSL経由でコマンドを実行する', () => {
      vi.mocked(execSync).mockReturnValue('command output');

      const result = runShellCommand('echo hello');

      expect(result).toBe('command output');
      expect(execSync).toHaveBeenCalledWith(
        'wsl bash -lc "echo hello"',
        expect.objectContaining({
          encoding: 'utf-8',
          stdio: 'pipe',
        })
      );
    });

    it('コマンド内のダブルクォートをエスケープする', () => {
      vi.mocked(execSync).mockReturnValue('');

      runShellCommand('echo "test"');

      expect(execSync).toHaveBeenCalledWith(
        'wsl bash -lc "echo \\"test\\""',
        expect.any(Object)
      );
    });

    it('カスタムオプションを渡せる', () => {
      vi.mocked(execSync).mockReturnValue('');

      runShellCommand('command', {
        timeout: 30000,
        cwd: '/some/path',
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 30000,
          cwd: '/some/path',
        })
      );
    });

    it('input オプションを渡せる（パスワード入力用）', () => {
      vi.mocked(execSync).mockReturnValue('');

      runShellCommand('sudo command', { input: 'password\n' });

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: 'password\n',
        })
      );
    });
  });

  describe('checkPasswordlessSudoNative', () => {
    it('パスワードレスsudoが利用可能な場合はtrueを返す', () => {
      vi.mocked(execSync).mockReturnValue('');

      const result = checkPasswordlessSudoNative();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'sudo -n true 2>/dev/null',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('パスワードレスsudoが利用不可能な場合はfalseを返す', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('sudo: a password is required');
      });

      const result = checkPasswordlessSudoNative();

      expect(result).toBe(false);
    });
  });

  describe('getMessengerShellPath', () => {
    it('Windows環境ではWSL内のパスを返す', () => {
      // CURRENT_ENV は 'windows-native' にモックされている
      const result = getMessengerShellPath();

      expect(result).toBe('~/.maid-agent/maid-agent-messenger');
    });
  });
});

// Mac/Linux環境のテストは環境モックの切り替えが複雑なため、
// 別ファイルで後日実装予定
// describe('pm2-setup (Mac/Linux)', () => { ... });
