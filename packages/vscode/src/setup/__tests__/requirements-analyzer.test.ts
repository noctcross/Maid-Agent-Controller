import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';

// child_process モック
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// fs モック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// vscode モック
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

// 環境変数モック（デフォルト: windows-native）
vi.mock('../../utils/environment', () => ({
  CURRENT_ENV: 'windows-native',
  ENV: {
      platform: 'windows-native',
      isWindowsNative: () => true,
      isWsl: () => false,
      isMacOS: () => false,
      isPsmux: () => false,
      getMultiplexerCommand: () => 'wsl tmux',
      windowsToWslPath: (p: string) => p,
      normalizePathForServer: (p: string) => p,
      needsWslPrefix: () => true,
      setRuntimeMode: vi.fn(),
      getRuntimeMode: vi.fn(() => undefined),
  },
}));

// environment-context モック（CommandExecutor 統合用）
const { mockCommandExecutor } = vi.hoisted(() => ({
  mockCommandExecutor: {
    execInLoginShell: vi.fn(),
    commandExists: vi.fn(),
    execWithSudoNoPassword: vi.fn(),
  },
}));
vi.mock('../../utils/environment-context', () => ({
  ENV: {
    platform: 'windows-native',
    isWindowsNative: () => true,
    commandExecutor: mockCommandExecutor,
  },
}));

// pm2-setup モック
vi.mock('../pm2-setup', () => ({
  runShellCommand: vi.fn(),
  getMessengerShellPath: vi.fn(() => '~/.maid-agent/maid-agent-messenger'),
}));

// helpers モック
vi.mock('../../utils/helpers', () => ({
  getMessengerPath: vi.fn(() => '/mock/path/.maid-agent/maid-agent-messenger'),
  getGlobalMaidAgentPath: vi.fn(() => '/mock/path/.maid-agent'),
  getWslMaidAgentPath: vi.fn(() => '\\\\wsl.localhost\\Ubuntu\\home\\user\\.maid-agent'),
  getExecutionMaidAgentPath: vi.fn(() => '/mock/path/.maid-agent'),
}));

// package-manager モック
vi.mock('../../utils/package-manager', () => ({
  detectPackageManager: vi.fn(() => 'npm'),
  PackageManager: {} as any,
}));

import {
  checkWslInstalled,
  checkUbuntuInstalled,
  checkPasswordlessSudoConfigured,
  checkJqInstalledSimple,
  checkPm2Installed,
  checkPm2StartupConfigured,
  checkPathConfigured,
  countRequiredSteps,
  isAllConfigured,
  GlobalRequirements,
} from '../requirements-analyzer';
import { runShellCommand } from '../pm2-setup';

describe('requirements-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // process.env.HOME をモック
    process.env.HOME = '/home/testuser';
  });

  describe('checkWslInstalled', () => {
    it('WSLがインストール済みの場合はtrueを返す', () => {
      vi.mocked(execSync).mockReturnValue('WSL version: 2.0.0');

      const result = checkWslInstalled();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'wsl.exe --version',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('WSLが未インストールの場合はfalseを返す', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('wsl.exe not found');
      });

      const result = checkWslInstalled();

      expect(result).toBe(false);
    });
  });

  describe('checkUbuntuInstalled', () => {
    it('Ubuntuがインストール済みの場合はtrueを返す', () => {
      vi.mocked(execSync).mockReturnValue('Ubuntu\nDebian\n');

      const result = checkUbuntuInstalled();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'wsl.exe -l -q',
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('Ubuntu以外のディストロの場合はfalseを返す', () => {
      vi.mocked(execSync).mockReturnValue('Debian\nAlpine\n');

      const result = checkUbuntuInstalled();

      expect(result).toBe(false);
    });

    it('WSLコマンドが失敗した場合はfalseを返す', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('wsl command failed');
      });

      const result = checkUbuntuInstalled();

      expect(result).toBe(false);
    });

    it('大文字小文字を区別しない（UBUNTU, ubuntu）', () => {
      vi.mocked(execSync).mockReturnValue('UBUNTU-22.04\n');

      const result = checkUbuntuInstalled();

      expect(result).toBe(true);
    });
  });

  describe('checkPasswordlessSudoConfigured', () => {
    it('パスワードレスsudoが設定済みの場合はtrueを返す', () => {
      mockCommandExecutor.execWithSudoNoPassword.mockReturnValue('');

      const result = checkPasswordlessSudoConfigured();

      expect(result).toBe(true);
      expect(mockCommandExecutor.execWithSudoNoPassword).toHaveBeenCalledWith(
        'true',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('パスワードが必要な場合はfalseを返す', () => {
      mockCommandExecutor.execWithSudoNoPassword.mockImplementation(() => {
        throw new Error('sudo: a password is required');
      });

      const result = checkPasswordlessSudoConfigured();

      expect(result).toBe(false);
    });
  });

  describe('checkJqInstalledSimple', () => {
    it('jqがインストール済みの場合はtrueを返す', () => {
      mockCommandExecutor.commandExists.mockReturnValue(true);

      const result = checkJqInstalledSimple();

      expect(result).toBe(true);
      expect(mockCommandExecutor.commandExists).toHaveBeenCalledWith('jq');
    });

    it('jqが未インストールの場合はfalseを返す', () => {
      mockCommandExecutor.commandExists.mockReturnValue(false);

      const result = checkJqInstalledSimple();

      expect(result).toBe(false);
    });
  });

  describe('checkPm2Installed', () => {
    it('pm2がインストール済みの場合はtrueを返す', () => {
      vi.mocked(runShellCommand).mockReturnValue('/usr/bin/pm2');

      const result = checkPm2Installed();

      expect(result).toBe(true);
      expect(runShellCommand).toHaveBeenCalledWith(
        'which pm2',
        expect.objectContaining({ stdio: 'pipe' })
      );
    });

    it('pm2が未インストールの場合はfalseを返す', () => {
      vi.mocked(runShellCommand).mockImplementation(() => {
        throw new Error('pm2 not found');
      });

      const result = checkPm2Installed();

      expect(result).toBe(false);
    });
  });

  describe('checkPm2StartupConfigured', () => {
    it('pm2 startupが設定済みの場合はtrueを返す', () => {
      vi.mocked(runShellCommand).mockReturnValue('[PM2] Init System already found.');

      const result = checkPm2StartupConfigured();

      expect(result).toBe(true);
    });

    it('pm2 startupが未設定の場合はfalseを返す', () => {
      vi.mocked(runShellCommand).mockReturnValue('sudo env PATH=... pm2 startup systemd');

      const result = checkPm2StartupConfigured();

      expect(result).toBe(false);
    });

    it('pm2がない場合はfalseを返す', () => {
      vi.mocked(runShellCommand).mockImplementation(() => {
        throw new Error('pm2 command not found');
      });

      const result = checkPm2StartupConfigured();

      expect(result).toBe(false);
    });
  });

  describe('checkPathConfigured', () => {
    it('PATH設定済みの場合はtrueを返す（.zshrc）', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('.zshrc');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        'export PATH="$HOME/.maid-agent/bin:$PATH"\n'
      );

      const result = checkPathConfigured();

      expect(result).toBe(true);
    });

    it('PATH設定済みの場合はtrueを返す（.bashrc）', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('.bashrc');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        '# some config\nexport PATH="$HOME/.maid-agent/bin:$PATH"\n'
      );

      const result = checkPathConfigured();

      expect(result).toBe(true);
    });

    it('PATH未設定の場合はfalseを返す', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# empty config\n');

      const result = checkPathConfigured();

      expect(result).toBe(false);
    });

    it('設定ファイルがない場合はfalseを返す', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = checkPathConfigured();

      expect(result).toBe(false);
    });

    it('HOMEが未設定の場合はfalseを返す', () => {
      const originalHome = process.env.HOME;
      const originalUserprofile = process.env.USERPROFILE;
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      const result = checkPathConfigured();

      expect(result).toBe(false);

      // 復元
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserprofile;
    });
  });

  describe('countRequiredSteps', () => {
    it('すべて設定済みの場合は0を返す', () => {
      const requirements: GlobalRequirements = {
        platform: 'windows-native',
        packageManager: 'npm',
        runtimeMode: 'wsl',
        needs: {
          wslInstall: false,
          ubuntuInstall: false,
          psmuxInstall: false,
          nodeInstall: false,
          gitInstall: false,
          claudeCodeInstall: false,
          passwordlessSudo: false,
          jqInstall: false,
          yqInstall: false,
          pm2Install: false,
          pathSetup: false,
        },
        needsSudoPassword: false,
        requiresReboot: false,
      };

      expect(countRequiredSteps(requirements)).toBe(0);
    });

    it('必要な項目数を正しくカウントする', () => {
      const requirements: GlobalRequirements = {
        platform: 'windows-native',
        packageManager: 'npm',
        runtimeMode: 'wsl',
        needs: {
          wslInstall: false,
          ubuntuInstall: false,
          psmuxInstall: false,
          nodeInstall: false,
          gitInstall: false,
          claudeCodeInstall: false,
          passwordlessSudo: true,  // +1
          jqInstall: true,         // +1
          yqInstall: false,
          pm2Install: false,
          pathSetup: false,
        },
        needsSudoPassword: true,
        requiresReboot: false,
      };

      expect(countRequiredSteps(requirements)).toBe(2);
    });

    it('WSL含む全項目未設定の場合は11を返す', () => {
      const requirements: GlobalRequirements = {
        platform: 'windows-native',
        packageManager: 'npm',
        runtimeMode: 'wsl',
        needs: {
          wslInstall: true,        // +1
          ubuntuInstall: true,     // +1
          psmuxInstall: true,      // +1
          nodeInstall: true,       // +1
          gitInstall: true,        // +1
          claudeCodeInstall: true, // +1
          passwordlessSudo: true,  // +1
          jqInstall: true,         // +1
          yqInstall: true,         // +1
          pm2Install: true,        // +1
          pathSetup: true,         // +1
        },
        needsSudoPassword: true,
        requiresReboot: true,
      };

      expect(countRequiredSteps(requirements)).toBe(11);
    });
  });

  describe('isAllConfigured', () => {
    it('すべて設定済みの場合はtrueを返す', () => {
      const requirements: GlobalRequirements = {
        platform: 'windows-native',
        packageManager: 'npm',
        runtimeMode: 'wsl',
        needs: {
          wslInstall: false,
          ubuntuInstall: false,
          psmuxInstall: false,
          nodeInstall: false,
          gitInstall: false,
          claudeCodeInstall: false,
          passwordlessSudo: false,
          jqInstall: false,
          yqInstall: false,
          pm2Install: false,
          pathSetup: false,
        },
        needsSudoPassword: false,
        requiresReboot: false,
      };

      expect(isAllConfigured(requirements)).toBe(true);
    });

    it('1つでも未設定の場合はfalseを返す', () => {
      const requirements: GlobalRequirements = {
        platform: 'windows-native',
        packageManager: 'npm',
        runtimeMode: 'wsl',
        needs: {
          wslInstall: false,
          ubuntuInstall: false,
          psmuxInstall: false,
          nodeInstall: false,
          gitInstall: false,
          claudeCodeInstall: false,
          passwordlessSudo: false,
          jqInstall: false,
          yqInstall: false,
          pm2Install: false,
          pathSetup: true,  // 未設定
        },
        needsSudoPassword: false,
        requiresReboot: false,
      };

      expect(isAllConfigured(requirements)).toBe(false);
    });
  });

  // =============================================================================
  // psmuxモード用チェック関数のテスト
  // =============================================================================

  describe('checkJqInstalledPsmux', () => {
    it('jqがインストール済みの場合はtrueを返す（where jq成功）', async () => {
      const { checkJqInstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockReturnValue('C:\\Program Files\\jq\\jq.exe');

      const result = checkJqInstalledPsmux();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'where jq',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('jqが未インストールの場合はfalseを返す', async () => {
      const { checkJqInstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('INFO: Could not find files for the given pattern(s).');
      });

      const result = checkJqInstalledPsmux();

      expect(result).toBe(false);
    });
  });

  describe('checkYqInstalledPsmux', () => {
    it('yqがインストール済みの場合はtrueを返す（where yq成功）', async () => {
      const { checkYqInstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockReturnValue('C:\\Program Files\\yq\\yq.exe');

      const result = checkYqInstalledPsmux();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'where yq',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('yqが未インストールの場合はfalseを返す', async () => {
      const { checkYqInstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('INFO: Could not find files for the given pattern(s).');
      });

      const result = checkYqInstalledPsmux();

      expect(result).toBe(false);
    });
  });

  describe('checkPm2InstalledPsmux', () => {
    it('pm2がインストール済みの場合はtrueを返す', async () => {
      const { checkPm2InstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockReturnValue('C:\\Users\\user\\AppData\\Roaming\\npm\\pm2.cmd');

      const result = checkPm2InstalledPsmux();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'where pm2',
        expect.objectContaining({ stdio: 'pipe', timeout: 5000 })
      );
    });

    it('pm2が未インストールの場合はfalseを返す', async () => {
      const { checkPm2InstalledPsmux } = await import('../requirements-analyzer');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('INFO: Could not find files for the given pattern(s).');
      });

      const result = checkPm2InstalledPsmux();

      expect(result).toBe(false);
    });
  });

  describe('checkPathConfiguredPsmux', () => {
    it('PATH設定済みの場合はtrueを返す（PowerShell $PROFILE）', async () => {
      const { checkPathConfiguredPsmux } = await import('../requirements-analyzer');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        '$env:PATH = "$env:USERPROFILE\\.maid-agent\\bin;$env:PATH"'
      );

      const result = checkPathConfiguredPsmux();

      expect(result).toBe(true);
    });

    it('PATH未設定の場合はfalseを返す', async () => {
      const { checkPathConfiguredPsmux } = await import('../requirements-analyzer');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# Empty profile');

      const result = checkPathConfiguredPsmux();

      expect(result).toBe(false);
    });

    it('$PROFILEが存在しない場合はfalseを返す', async () => {
      const { checkPathConfiguredPsmux } = await import('../requirements-analyzer');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = checkPathConfiguredPsmux();

      expect(result).toBe(false);
    });
  });
});
