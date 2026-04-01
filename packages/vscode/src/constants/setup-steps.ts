/**
 * セットアップステップの型定義
 *
 * 元々 setup/setup-ui.ts に定義されていたが、
 * constants/messages.ts からの循環依存を解消するために分離。
 *
 * @see setup/setup-ui.ts - セットアップUI共通モジュール
 */

export interface SetupStep {
    id: string;
    label: string;
    progressMessage: string;
    estimatedSeconds: number;
}
