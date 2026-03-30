/**
 * セットアップ戦略のインターフェース定義
 *
 * Psmuxモード（Windows直接）とUnixモード（WSL/Mac/Linux）で
 * 実装が異なる処理を抽象化する。
 */
import { SetupContext } from '../../types';

/**
 * セットアップ戦略インターフェース
 */
export interface SetupStrategy {
    /** 戦略名（ログ用） */
    readonly name: 'psmux' | 'unix';

    /** jq インストール */
    installJq(ctx: SetupContext, password?: string): Promise<void>;

    /** yq インストール */
    installYq(ctx: SetupContext, password?: string): Promise<void>;

    /** pm2 インストール */
    installPm2(ctx: SetupContext, password?: string): Promise<void>;

    /** maid-agent-messenger サーバーセットアップ */
    setupMessengerServer(ctx: SetupContext): Promise<void>;

    /** PATH 設定 */
    setupPath(ctx: SetupContext): Promise<void>;
}

/**
 * Psmux専用の拡張インターフェース
 */
export interface PsmuxSetupStrategy extends SetupStrategy {
    readonly name: 'psmux';

    /** psmux インストール（Windowsマルチプレクサ） */
    installPsmux(ctx: SetupContext): Promise<void>;

    /** Node.js インストール（psmuxのみ必要） */
    installNodeJs(ctx: SetupContext): Promise<void>;
}

/**
 * Unix専用の拡張インターフェース
 */
export interface UnixSetupStrategy extends SetupStrategy {
    readonly name: 'unix';

    /** パスワードレスsudo設定 */
    setupPasswordlessSudo(ctx: SetupContext, password?: string): Promise<void>;

    /** pm2 startup設定 */
    setupPm2Startup(ctx: SetupContext, password?: string): Promise<void>;
}

/**
 * 戦略がPsmux用かどうか判定
 */
export function isPsmuxStrategy(strategy: SetupStrategy): strategy is PsmuxSetupStrategy {
    return strategy.name === 'psmux';
}

/**
 * 戦略がUnix用かどうか判定
 */
export function isUnixStrategy(strategy: SetupStrategy): strategy is UnixSetupStrategy {
    return strategy.name === 'unix';
}
