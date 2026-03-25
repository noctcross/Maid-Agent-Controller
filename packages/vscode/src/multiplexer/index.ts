/**
 * ターミナルマルチプレクサ抽象化レイヤー
 *
 * tmux/psmux の切り替えを可能にする抽象化レイヤー。
 * Windows ネイティブ環境では psmux、WSL 環境では tmux を使用可能。
 *
 * @example
 * ```typescript
 * import { MultiplexerFactory } from './multiplexer';
 *
 * const factory = new MultiplexerFactory();
 * const multiplexer = factory.create('maid-agent-session', '/path/to/project');
 *
 * multiplexer.createSession();
 * multiplexer.createWindow('butler');
 * multiplexer.sendKeys('butler', 'echo "Hello"');
 * ```
 */

// インターフェース
export {
    ITerminalMultiplexer,
    IMultiplexerFactory,
    MultiplexerType,
    MultiplexerConfig
} from './interfaces';

// 抽象基底クラス
export { AbstractMultiplexerAdapter } from './base-adapter';

// 具象アダプター
export { TmuxAdapter } from './tmux-adapter';
export { PsmuxAdapter } from './psmux-adapter';

// ファクトリー
export { MultiplexerFactory } from './factory';
