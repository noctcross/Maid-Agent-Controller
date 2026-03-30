/**
 * セットアップ戦略の選択とエクスポート
 */
import { RuntimeMode } from '../../types';
import { CURRENT_ENV } from '../../utils/environment';
import { SetupStrategy, PsmuxSetupStrategy, UnixSetupStrategy, isPsmuxStrategy, isUnixStrategy } from './types';
import { psmuxStrategy } from './psmux-strategy';
import { unixStrategy } from './unix-strategy';

// 型をre-export
export { SetupStrategy, PsmuxSetupStrategy, UnixSetupStrategy, isPsmuxStrategy, isUnixStrategy } from './types';
export { psmuxStrategy } from './psmux-strategy';
export { unixStrategy } from './unix-strategy';

/**
 * ランタイムモードに基づいて適切な戦略を選択
 *
 * @param runtimeMode ユーザーが選択したランタイムモード
 * @returns 選択された戦略
 *
 * @example
 * const strategy = getStrategy('windows-native');
 * await strategy.installJq(ctx);
 *
 * if (isPsmuxStrategy(strategy)) {
 *   await strategy.installNodeJs(ctx);  // Psmux専用メソッド
 * }
 */
export function getStrategy(runtimeMode: RuntimeMode): SetupStrategy {
    // Psmuxモード: Windows環境 + windows-native 選択
    if (CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native') {
        return psmuxStrategy;
    }

    // それ以外はすべてUnix戦略
    // - Mac/Linux: ネイティブ実行
    // - Windows + wsl: WSL経由で実行
    // - Windows + both: この関数は個別のモードで呼ばれる前提
    return unixStrategy;
}

/**
 * 現在の環境がPsmuxモードかどうか判定
 *
 * @param runtimeMode ユーザーが選択したランタイムモード
 * @returns Psmuxモードの場合true
 */
export function isPsmuxMode(runtimeMode: RuntimeMode): boolean {
    return CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';
}

/**
 * 現在の環境がUnixモード（WSL含む）かどうか判定
 *
 * @param runtimeMode ユーザーが選択したランタイムモード
 * @returns Unixモードの場合true
 */
export function isUnixMode(runtimeMode: RuntimeMode): boolean {
    return !isPsmuxMode(runtimeMode);
}
