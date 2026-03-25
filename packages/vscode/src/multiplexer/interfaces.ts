/**
 * ターミナルマルチプレクサ抽象化レイヤー - インターフェース定義
 *
 * tmux/psmux の共通操作を抽象化し、環境に応じた切り替えを可能にする
 */

/**
 * マルチプレクサの種類
 */
export type MultiplexerType = 'tmux' | 'psmux';

/**
 * 環境設定
 */
export interface MultiplexerConfig {
    type: MultiplexerType;
    /** psmux の場合、tmux エイリアスを使用するか */
    useTmuxAlias?: boolean;
}

/**
 * ターミナルマルチプレクサの抽象インターフェース
 * tmux/psmux の共通操作を定義
 */
export interface ITerminalMultiplexer {
    // ========== セッション管理 ==========

    /**
     * セッションが存在するかチェック
     */
    sessionExists(): boolean;

    /**
     * セッションを作成（存在しない場合）
     */
    createSession(): void;

    /**
     * セッションを終了
     */
    killSession(): void;

    /**
     * セッション名を取得
     */
    getSessionName(): string;

    // ========== ウィンドウ管理 ==========

    /**
     * ウィンドウが存在するかチェック
     */
    windowExists(windowName: string): boolean;

    /**
     * 新しいウィンドウを作成
     */
    createWindow(windowName: string): void;

    /**
     * ウィンドウを終了
     */
    killWindow(windowName: string): void;

    /**
     * セッション内の全ウィンドウ名を取得
     */
    listWindows(): string[];

    /**
     * 指定ウィンドウに切り替え
     */
    selectWindow(windowName: string): void;

    // ========== キー送信 ==========

    /**
     * 指定ウィンドウにキー入力を送信
     * @param windowName ウィンドウ名
     * @param keys 送信するキー文字列
     * @param pressEnter Enterキーを送信するか（デフォルト: true）
     */
    sendKeys(windowName: string, keys: string, pressEnter?: boolean): void;

    /**
     * copy mode（スクロールモード）を解除
     */
    cancelCopyMode(windowName: string): void;

    // ========== その他 ==========

    /**
     * 指定ウィンドウの出力をキャプチャ
     * @param windowName ウィンドウ名
     * @param lines キャプチャする行数（デフォルト: 100）
     */
    capturePane(windowName: string, lines?: number): string;

    /**
     * 作業ディレクトリを取得
     */
    getWorkingDirectory(): string;
}

/**
 * ファクトリーインターフェース
 * マルチプレクサインスタンスの生成と静的操作を提供
 */
export interface IMultiplexerFactory {
    /**
     * マルチプレクサインスタンスを生成
     * @param sessionName セッション名
     * @param workingDirectory 作業ディレクトリ
     */
    create(sessionName: string, workingDirectory: string): ITerminalMultiplexer;

    /**
     * maid-agentセッションの数を取得
     */
    countMaidAgentSessions(): { count: number; sessions: string[] };

    /**
     * マルチプレクサの種類を取得
     */
    getType(): MultiplexerType;
}
