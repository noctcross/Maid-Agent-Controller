import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';

// =============================================================================
// 環境検出
// =============================================================================

/**
 * 実行環境の種類
 */
type ExecutionEnvironment = 'wsl' | 'windows-native' | 'linux' | 'macos';

/**
 * 現在の実行環境を検出
 */
function detectEnvironment(): ExecutionEnvironment {
    const platform = os.platform();

    if (platform === 'linux') {
        // WSL内かネイティブLinuxかを判定
        try {
            const release = fs.readFileSync('/proc/version', 'utf-8').toLowerCase();
            if (release.includes('microsoft') || release.includes('wsl')) {
                return 'wsl';
            }
        } catch {
            // /proc/versionが読めない場合はネイティブLinuxと判断
        }
        return 'linux';
    } else if (platform === 'win32') {
        return 'windows-native';
    } else if (platform === 'darwin') {
        return 'macos';
    }

    return 'linux'; // フォールバック
}

/**
 * WindowsパスをWSLパスに変換
 * C:\Users\... → /mnt/c/Users/...
 */
function windowsToWslPath(windowsPath: string): string {
    // 既にWSLパスの場合はそのまま返す
    if (windowsPath.startsWith('/')) {
        return windowsPath;
    }

    // C:\path\to\file → /mnt/c/path/to/file
    const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
    if (match) {
        const driveLetter = match[1].toLowerCase();
        const restPath = match[2].replace(/\\/g, '/');
        return `/mnt/${driveLetter}/${restPath}`;
    }

    // UNCパスなどの場合はそのまま返す
    return windowsPath.replace(/\\/g, '/');
}

/**
 * 現在の環境をキャッシュ
 */
const CURRENT_ENV = detectEnvironment();

/**
 * tmuxが利用可能な環境かチェック
 */
function isTmuxAvailable(): boolean {
    try {
        if (CURRENT_ENV === 'windows-native') {
            execSync('wsl tmux -V', { encoding: 'utf-8', stdio: 'pipe' });
        } else {
            execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * tmuxのバージョンを取得
 */
function getTmuxVersion(): string | null {
    try {
        if (CURRENT_ENV === 'windows-native') {
            return execSync('wsl tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        } else {
            return execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        }
    } catch {
        return null;
    }
}

/**
 * WSLが利用可能かチェック（Windows環境のみ）
 */
function isWslAvailable(): boolean {
    if (CURRENT_ENV !== 'windows-native') {
        return true; // Windows以外では常にtrue
    }

    try {
        // WSLが動作しているかチェック
        execSync('wsl --status', { encoding: 'utf-8', stdio: 'pipe' });
        return true;
    } catch {
        try {
            // --statusがない古いバージョン用フォールバック
            execSync('wsl echo ok', { encoding: 'utf-8', stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }
}

// =============================================================================
// Markdown to HTML 変換
// =============================================================================

/**
 * シンプルなMarkdown→HTML変換関数
 * dashboard.mdのレンダリング用
 */
function simpleMarkdownToHtml(markdown: string): string {
    // 改行コードを統一（Windows対応）
    let html = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // HTMLエスケープ（まず最初に）
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // コードブロック（```...```）- 先に処理
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
    });

    // インラインコード（`...`）
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // テーブル（より正確なパース）- 見出しより先に処理
    // Markdownテーブル形式:
    // | Header1 | Header2 |
    // |---------|---------|
    // | Data1   | Data2   |
    const tableRegex = /(?:^[ \t]*\|.+\|[ \t]*$\n?)+/gm;
    html = html.replace(tableRegex, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(row => row.trim());
        if (rows.length < 2) return tableBlock; // 最低2行必要（ヘッダー+セパレータ）

        let tableHtml = '<table class="md-table">';
        let isHeaderDone = false;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            // セル内容を抽出（先頭と末尾の | を除去）
            const cellContent = row.replace(/^\||\|$/g, '');
            const cells = cellContent.split('|').map(cell => cell.trim());

            // セパレータ行（|---|---|）をスキップ
            if (cells.every(cell => /^[-:]+$/.test(cell))) {
                isHeaderDone = true;
                continue;
            }

            // ヘッダー行（セパレータの前の行）
            if (!isHeaderDone) {
                tableHtml += '<thead><tr>';
                cells.forEach(cell => {
                    tableHtml += `<th>${cell}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            } else {
                // データ行
                tableHtml += '<tr>';
                cells.forEach(cell => {
                    tableHtml += `<td>${cell}</td>`;
                });
                tableHtml += '</tr>';
            }
        }

        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // 見出し（### ## #）
    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

    // 水平線（---）
    html = html.replace(/^---$/gm, '<hr class="md-hr">');

    // チェックボックス
    html = html.replace(/^- \[x\] (.+)$/gm, '<div class="md-checkbox checked">☑ $1</div>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<div class="md-checkbox">☐ $1</div>');

    // リスト（- item）
    html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
    // 連続するliをulで囲む
    html = html.replace(/(<li class="md-li">.*?<\/li>\n?)+/g, (match) => {
        return `<ul class="md-ul">${match}</ul>`;
    });

    // 太字（**...**）
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体（*...*）- 太字の後に処理
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // リンク [text](url) - 外部リンクは無効化
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">$1</span>');

    // 段落（空行で区切られたテキスト）
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');
    html = `<p class="md-p">${html}</p>`;

    // 空のpタグを削除
    html = html.replace(/<p class="md-p"><\/p>/g, '');
    html = html.replace(/<p class="md-p">(\s*<(?:h[1-3]|ul|table|pre|hr|div))/g, '$1');
    html = html.replace(/(<\/(?:h[1-3]|ul|table|pre|hr|div)>\s*)<\/p>/g, '$1');

    return html;
}

// =============================================================================
// 型定義
// =============================================================================

interface Agent {
    name: string;
    id: string;
    terminal?: vscode.Terminal;  // VSCodeターミナル（tmuxビューア用、オプショナル）
    tmuxWindow: string;          // tmuxウィンドウ名
    role: 'butler' | 'chiefMaid' | 'maid';
    status: 'offline' | 'idle' | 'working' | 'done';
}

interface MaidConfig {
    name: string;
    id: string;
    emoji: string;
}

// =============================================================================
// 定数
// =============================================================================

const MAID_AGENT_DIR = '.maid-agent';
const GLOBAL_MAID_AGENT_DIR = '.maid-agent';  // ~/.maid-agent/
const TMUX_SESSION_PREFIX = 'maid-agent';  // tmuxセッション名のプレフィックス

/**
 * グローバルフォルダのパスを取得
 * Windows環境ではWSLのホームディレクトリを使用
 */
function getGlobalMaidAgentPath(): string {
    if (CURRENT_ENV === 'windows-native') {
        // Windows環境: WSLのホームディレクトリを使用
        try {
            // シングルクォートで囲んでWindowsシェルでの$HOME展開を防ぐ
            const wslHome = execSync("wsl bash -c 'echo $HOME'", { encoding: 'utf-8' }).trim();
            // WSLディストリビューション名を取得（UTF-16のヌルバイトと空白を除去）
            const distroRaw = execSync('wsl -l -q', { encoding: 'utf-8' });
            const distro = distroRaw.replace(/\0/g, '').split('\n')[0].trim();
            // スラッシュをバックスラッシュに変換してパスを構築
            const windowsHome = wslHome.replace(/\//g, '\\');
            return `\\\\wsl$\\${distro}${windowsHome}\\${GLOBAL_MAID_AGENT_DIR}`;
        } catch {
            // フォールバック: Windowsのホームディレクトリ
            return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
        }
    }
    return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
}

/**
 * ルールモジュールのメタデータ
 */
interface RuleModuleMeta {
    name: string;
    description: string;
    auto_select: boolean;
    target_roles: ('common' | 'butler' | 'chief' | 'maid')[];
    filePath: string;
}

/**
 * スキルのメタデータ
 */
interface SkillMeta {
    name: string;
    description: string;
    auto_select: boolean;
    filePath: string;
}

/**
 * 文字列から短いハッシュを生成
 */
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * ワークスペースパスからtmuxセッション名を生成
 * - ディレクトリ名を使用（読みやすさのため）
 * - 安全な文字のみにフィルタリング
 * - 短いハッシュを追加（衝突防止）
 */
function getSessionNameFromPath(workspacePath: string): string {
    const dirName = path.basename(workspacePath);

    // 安全な文字のみ抽出（小文字アルファベット、数字、ハイフン、アンダースコア）
    const safeName = dirName.toLowerCase()
        .replace(/\s+/g, '-')           // スペースをハイフンに
        .replace(/[^a-z0-9_-]/g, '')    // 安全でない文字を除去
        .replace(/-+/g, '-')            // 連続ハイフンを1つに
        .replace(/^-|-$/g, '')          // 先頭・末尾のハイフンを除去
        .substring(0, 20);              // 長すぎる場合は切り詰め

    // 短いハッシュを追加（同名フォルダの衝突防止）
    const shortHash = hashString(workspacePath).substring(0, 4);

    if (safeName.length > 0) {
        return `${TMUX_SESSION_PREFIX}-${safeName}-${shortHash}`;
    }
    // 安全な文字が残らない場合（日本語のみのフォルダ名など）はハッシュのみ
    return `${TMUX_SESSION_PREFIX}-${hashString(workspacePath)}`;
}

const MAIDS_MAP: { [key: string]: MaidConfig } = {
    emma: { name: 'エマ', id: 'emma', emoji: '🎀' },
    sophia: { name: 'ソフィア', id: 'sophia', emoji: '🎀' },
    lily: { name: 'リリー', id: 'lily', emoji: '🎀' },
    rose: { name: 'ローズ', id: 'rose', emoji: '🎀' },
    alice: { name: 'アリス', id: 'alice', emoji: '🎀' },
    may: { name: 'メイ', id: 'may', emoji: '🎀' },
    flora: { name: 'フローラ', id: 'flora', emoji: '🎀' },
    luna: { name: 'ルナ', id: 'luna', emoji: '🎀' },
};

const DEFAULT_MAID_ORDER = ['emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'];

/**
 * 設定からメイドの順序を取得
 */
function getOrderedMaids(): MaidConfig[] {
    const config = vscode.workspace.getConfiguration('maidAgent');
    const maidOrder = config.get<string[]>('maidOrder', DEFAULT_MAID_ORDER);

    // 設定に基づいて順序付けされたメイドリストを作成
    const orderedMaids: MaidConfig[] = [];
    for (const id of maidOrder) {
        if (MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    // 設定に含まれていないメイドを追加（安全のため）
    for (const id of DEFAULT_MAID_ORDER) {
        if (!maidOrder.includes(id) && MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    return orderedMaids;
}

// 後方互換性のためのエイリアス（内部で getOrderedMaids() を使用）
const MAIDS = DEFAULT_MAID_ORDER.map(id => MAIDS_MAP[id]);

// エージェントごとの色設定
const AGENT_COLORS: { [key: string]: { bg: string; accent: string } } = {
    butler: { bg: '#1a1a2e', accent: '#008080' },      // ティール
    chief: { bg: '#1a1a2e', accent: '#008080' },       // ティール
    emma: { bg: '#1a1a2e', accent: '#8B5A2B' },        // ブラウン
    sophia: { bg: '#1a1a2e', accent: '#4169E1' },      // ブルー
    lily: { bg: '#1a1a2e', accent: '#FFB6C1' },        // ピンク
    rose: { bg: '#1a1a2e', accent: '#DC143C' },        // レッド
    alice: { bg: '#1a1a2e', accent: '#DAA520' },       // ゴールド
    may: { bg: '#1a1a2e', accent: '#808080' },         // グレー
    flora: { bg: '#1a1a2e', accent: '#228B22' },       // グリーン
    luna: { bg: '#1a1a2e', accent: '#800080' },        // パープル
};

// =============================================================================
// Tmux マネージャー
// =============================================================================

class TmuxManager {
    private sessionName: string;
    private workingDirectory: string;      // 元のパス（Windows or WSL）
    private wslWorkingDirectory: string;   // WSL用パス
    private isWindowsNative: boolean;

    constructor(sessionName: string, workingDirectory: string) {
        this.sessionName = sessionName;
        this.workingDirectory = workingDirectory;
        this.isWindowsNative = CURRENT_ENV === 'windows-native';

        // Windows環境の場合はパスをWSL形式に変換
        this.wslWorkingDirectory = this.isWindowsNative
            ? windowsToWslPath(workingDirectory)
            : workingDirectory;
    }

    /**
     * tmuxコマンドを構築
     */
    private buildCommand(args: string): string {
        if (this.isWindowsNative) {
            // Windows環境: wsl経由でtmuxを実行
            return `wsl tmux ${args}`;
        }
        return `tmux ${args}`;
    }

    /**
     * tmuxコマンドを実行
     */
    private exec(args: string): string {
        try {
            const command = this.buildCommand(args);
            // Windows環境ではcwdを指定しない（WSL内のパスとして渡す）
            const options: any = { encoding: 'utf-8' };
            if (!this.isWindowsNative) {
                options.cwd = this.workingDirectory;
            }
            return execSync(command, options).trim();
        } catch (error: any) {
            // tmuxコマンドが失敗した場合（セッションが存在しない等）
            throw new Error(`tmux command failed: ${error.message}`);
        }
    }

    /**
     * tmuxコマンドを非同期で実行（結果を待たない）
     */
    private execAsync(args: string): void {
        const command = this.buildCommand(args);
        const options: any = {};
        if (!this.isWindowsNative) {
            options.cwd = this.workingDirectory;
        }
        exec(command, options);
    }

    /**
     * WSL用の作業ディレクトリを取得
     */
    getWslWorkingDirectory(): string {
        return this.wslWorkingDirectory;
    }

    /**
     * Windows環境かどうか
     */
    isWindows(): boolean {
        return this.isWindowsNative;
    }

    /**
     * セッションが存在するかチェック
     */
    sessionExists(): boolean {
        try {
            this.exec(`has-session -t ${this.sessionName}`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * セッションを作成（存在しない場合）
     */
    createSession(): void {
        if (!this.sessionExists()) {
            this.exec(`new-session -d -s ${this.sessionName} -c "${this.wslWorkingDirectory}"`);
            // copy-mode-timeout を設定（スクロール中の通知配信改善）
            // セッション固有の設定なので .tmux.conf を変更しない
            try {
                this.exec(`set-option -t ${this.sessionName} -g copy-mode-timeout 5`);
            } catch {
                // tmux 3.2 未満では copy-mode-timeout がサポートされていない
            }
        }
    }

    /**
     * セッションを終了
     */
    killSession(): void {
        if (this.sessionExists()) {
            try {
                this.exec(`kill-session -t ${this.sessionName}`);
            } catch {
                // セッションが既に終了している場合は無視
            }
        }
    }

    /**
     * maid-agentセッションの数を取得（静的メソッド）
     */
    static countMaidAgentSessions(): { count: number; sessions: string[] } {
        try {
            const command = CURRENT_ENV === 'windows-native'
                ? 'wsl tmux list-sessions -F "#{session_name}"'
                : 'tmux list-sessions -F "#{session_name}"';

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: 'pipe'
            }).trim();

            if (!result) {
                return { count: 0, sessions: [] };
            }

            const allSessions = result.split('\n');
            const maidSessions = allSessions.filter(name => name.startsWith(TMUX_SESSION_PREFIX));

            return {
                count: maidSessions.length,
                sessions: maidSessions
            };
        } catch {
            // tmuxサーバーが起動していない場合など
            return { count: 0, sessions: [] };
        }
    }

    /**
     * 新しいウィンドウを作成
     */
    createWindow(windowName: string): void {
        this.exec(`new-window -t ${this.sessionName} -n ${windowName} -c "${this.wslWorkingDirectory}"`);
    }

    /**
     * ウィンドウが存在するかチェック
     */
    windowExists(windowName: string): boolean {
        try {
            const windows = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return windows.split('\n').includes(windowName);
        } catch {
            return false;
        }
    }

    /**
     * ウィンドウを終了
     */
    killWindow(windowName: string): void {
        if (this.windowExists(windowName)) {
            try {
                this.exec(`kill-window -t ${this.sessionName}:${windowName}`);
            } catch {
                // ウィンドウが既に終了している場合は無視
            }
        }
    }

    /**
     * 指定ウィンドウにキー入力を送信
     */
    sendKeys(windowName: string, keys: string, pressEnter: boolean = true): void {
        // シングルクォートをエスケープ
        const escapedKeys = keys.replace(/'/g, "'\\''");
        const enterSuffix = pressEnter ? ' Enter' : '';
        this.exec(`send-keys -t ${this.sessionName}:${windowName} '${escapedKeys}'${enterSuffix}`);
    }

    /**
     * copy mode（スクロールモード）を解除
     * ユーザーがマウススクロールした場合、copy modeに入っている可能性がある
     */
    cancelCopyMode(windowName: string): void {
        try {
            // -X cancel でcopy modeをキャンセル
            this.exec(`send-keys -t ${this.sessionName}:${windowName} -X cancel`);
        } catch {
            // copy modeでない場合はエラーになるが無視
        }
        try {
            // 念のためEscapeも送信
            this.exec(`send-keys -t ${this.sessionName}:${windowName} Escape`);
        } catch {
            // 無視
        }
    }

    /**
     * 指定ウィンドウの出力をキャプチャ
     */
    capturePane(windowName: string, lines: number = 100): string {
        try {
            return this.exec(`capture-pane -t ${this.sessionName}:${windowName} -p -S -${lines}`);
        } catch {
            return '';
        }
    }

    /**
     * 指定ウィンドウに切り替え
     */
    selectWindow(windowName: string): void {
        this.exec(`select-window -t ${this.sessionName}:${windowName}`);
    }

    /**
     * セッション内の全ウィンドウ名を取得
     */
    listWindows(): string[] {
        try {
            const result = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return result.split('\n').filter(name => name.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * セッション名を取得
     */
    getSessionName(): string {
        return this.sessionName;
    }
}

// =============================================================================
// エージェントパネル（サイドバー用 WebviewView）
// =============================================================================

class AgentPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'maidAgent.agentPanel';
    private _view?: vscode.WebviewView;
    private _currentAgentId: string | null = null;
    private _agents: Map<string, Agent> = new Map();
    private _extensionUri: vscode.Uri;
    private _workspaceRoot: string | undefined;
    private _outputChannel: vscode.OutputChannel | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public setOutputChannel(channel: vscode.OutputChannel): void {
        this._outputChannel = channel;
    }

    private _log(message: string): void {
        if (this._outputChannel) {
            this._outputChannel.appendLine(`[AgentPanel] ${message}`);
        }
    }

    public setWorkspaceRoot(workspaceRoot: string | undefined): void {
        this._workspaceRoot = workspaceRoot;
        this._log(`setWorkspaceRoot: ${workspaceRoot}`);
        this._updateWebview();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        this._log(`resolveWebviewView: workspaceRoot=${this._workspaceRoot}`);

        // localResourceRoots にワークスペースも追加
        const resourceRoots = [this._extensionUri];
        if (this._workspaceRoot) {
            resourceRoots.push(vscode.Uri.file(this._workspaceRoot));
            this._log(`resolveWebviewView: localResourceRoots に ${this._workspaceRoot} を追加`);
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: resourceRoots
        };

        this._updateWebview();
    }

    public setAgents(agents: Map<string, Agent>): void {
        this._agents = agents;
        this._updateWebview();
    }

    public setCurrentAgent(agentId: string | null): void {
        this._currentAgentId = agentId;
        this._log(`setCurrentAgent: ${agentId}`);
        this._updateWebview();
    }

    /**
     * エージェントの画像パスを取得
     * 優先順位:
     * 1. ステータス画像 (emma_wait.png, emma_work.png, emma_question.png)
     * 2. バージョン画像 (emma_1.png, emma_2.png) からランダム選択
     * 3. 基本画像 (emma.png)
     */
    private _getAgentImageUri(agentId: string, status: string): string | null {
        if (!this._workspaceRoot || !this._view) {
            this._log(`画像取得スキップ: workspaceRoot=${!!this._workspaceRoot}, view=${!!this._view}`);
            return null;
        }

        const imagesDir = path.join(this._workspaceRoot, MAID_AGENT_DIR, 'system', 'resources', 'images');
        const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

        // imagesDir の存在確認
        const imagesDirExists = fs.existsSync(imagesDir);
        this._log(`画像検索: agentId=${agentId}, imagesDir=${imagesDir}, exists=${imagesDirExists}`);

        if (!imagesDirExists) {
            // ディレクトリ内容を確認
            const maidAgentDir = path.join(this._workspaceRoot, MAID_AGENT_DIR);
            if (fs.existsSync(maidAgentDir)) {
                try {
                    const contents = fs.readdirSync(maidAgentDir);
                    this._log(`.maid-agent 内容: ${contents.join(', ')}`);
                } catch (e) {
                    this._log(`.maid-agent 読み取りエラー: ${e}`);
                }
            } else {
                this._log(`.maid-agent ディレクトリが存在しません`);
            }
            return null;
        }

        // 1. ステータス画像を探す (emma_wait, emma_work, emma_question)
        const statusSuffix = status === 'working' ? 'work' :
                            status === 'done' ? 'done' : 'wait';
        for (const ext of extensions) {
            const statusImagePath = path.join(imagesDir, `${agentId}_${statusSuffix}.${ext}`);
            if (fs.existsSync(statusImagePath)) {
                const imageUri = vscode.Uri.file(statusImagePath);
                const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
                this._log(`ステータス画像発見: ${statusImagePath} -> ${webviewUri}`);
                return webviewUri;
            }
        }

        // 2. バージョン画像を探す (emma_1, emma_2, ...)
        const versionImages: string[] = [];
        for (const ext of extensions) {
            let version = 1;
            while (version <= 10) { // 最大10バージョンまで
                const versionImagePath = path.join(imagesDir, `${agentId}_${version}.${ext}`);
                if (fs.existsSync(versionImagePath)) {
                    versionImages.push(versionImagePath);
                    version++;
                } else {
                    break;
                }
            }
        }

        if (versionImages.length > 0) {
            // タブ切り替えごとにランダム選択
            const randomIndex = Math.floor(Math.random() * versionImages.length);
            const selectedPath = versionImages[randomIndex];
            const imageUri = vscode.Uri.file(selectedPath);
            const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
            this._log(`バージョン画像発見: ${selectedPath} -> ${webviewUri}`);
            return webviewUri;
        }

        // 3. 基本画像を探す (emma.png)
        for (const ext of extensions) {
            const imagePath = path.join(imagesDir, `${agentId}.${ext}`);
            if (fs.existsSync(imagePath)) {
                const imageUri = vscode.Uri.file(imagePath);
                const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
                this._log(`基本画像発見: ${imagePath} -> ${webviewUri}`);
                return webviewUri;
            }
        }

        // 見つからなかった場合、imagesDir の内容をログ
        try {
            const files = fs.readdirSync(imagesDir);
            this._log(`画像未発見 (${agentId}), images内のファイル: ${files.join(', ')}`);
        } catch (e) {
            this._log(`images ディレクトリ読み取りエラー: ${e}`);
        }

        return null;
    }

    private _updateWebview(): void {
        if (!this._view) {
            this._log('_updateWebview: view が未設定');
            return;
        }

        this._log(`_updateWebview: currentAgentId=${this._currentAgentId}, workspaceRoot=${this._workspaceRoot}`);

        const agent = this._currentAgentId ? this._agents.get(this._currentAgentId) : null;
        const colors = this._currentAgentId ? AGENT_COLORS[this._currentAgentId] : null;

        let content: string;
        if (agent && colors) {
            const roleLabel = agent.role === 'butler' ? '執事' :
                             agent.role === 'chiefMaid' ? 'メイド長' : 'メイド';
            const emoji = agent.role === 'butler' ? '🎩' :
                         agent.role === 'chiefMaid' ? '👑' : '🎀';
            const statusEmoji = agent.status === 'working' ? '⚡' :
                               agent.status === 'done' ? '✅' : '💤';
            const statusLabel = agent.status === 'working' ? 'working' :
                               agent.status === 'done' ? 'done' : 'waiting';

            // 画像があれば使用、なければ絵文字
            const imageUri = this._getAgentImageUri(this._currentAgentId!, agent.status);
            this._log(`_updateWebview: imageUri=${imageUri ? '取得成功' : 'null'}`);

            if (imageUri) {
                // 立ち絵スタイル（画像あり）
                content = `
                    <div class="agent-display standing" style="border-color: ${colors.accent};">
                        <div class="standing-image">
                            <img src="${imageUri}" class="character-img" alt="${agent.name}" />
                        </div>
                        <div class="info-bar" style="background: linear-gradient(to right, ${colors.accent}22, ${colors.accent}44);">
                            <div class="name" style="color: ${colors.accent};">${emoji} ${agent.name}</div>
                            <div class="role">${roleLabel}</div>
                            <div class="status">${statusEmoji} ${statusLabel}</div>
                        </div>
                    </div>
                `;
            } else {
                // 絵文字フォールバック
                content = `
                    <div class="agent-display compact" style="border-color: ${colors.accent};">
                        <div class="emoji-avatar" style="background: ${colors.accent}22;">
                            <span class="emoji">${emoji}</span>
                        </div>
                        <div class="name" style="color: ${colors.accent};">${agent.name}</div>
                        <div class="role">${roleLabel}</div>
                        <div class="status">${statusEmoji} ${statusLabel}</div>
                    </div>
                `;
            }
        } else {
            content = `
                <div class="no-agent">
                    <div class="emoji">👤</div>
                    <div class="message">エージェントのターミナルを<br>選択してください</div>
                </div>
            `;
        }

        this._view.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 8px;
        }

        /* 立ち絵スタイル（画像あり） */
        .agent-display.standing {
            width: 100%;
            max-width: 280px;
            border: 2px solid;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(0,0,0,0.3);
        }
        .standing-image {
            width: 100%;
            max-height: 400px;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            overflow: hidden;
        }
        .character-img {
            max-width: 100%;
            max-height: 400px;
            object-fit: contain;
            object-position: bottom center;
        }
        .info-bar {
            padding: 12px;
            text-align: center;
        }

        /* コンパクトスタイル（絵文字） */
        .agent-display.compact {
            text-align: center;
            padding: 20px;
            border-radius: 12px;
            border: 2px solid;
            width: 100%;
            max-width: 200px;
            background: rgba(0,0,0,0.3);
        }
        .emoji-avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* 共通 */
        .emoji {
            font-size: 40px;
        }
        .name {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .role {
            font-size: 0.8em;
            color: #aaa;
            margin-bottom: 6px;
        }
        .status {
            font-size: 0.85em;
            padding: 4px 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            display: inline-block;
        }

        /* エージェント未選択 */
        .no-agent {
            text-align: center;
            color: #666;
            padding: 40px 20px;
        }
        .no-agent .emoji {
            font-size: 60px;
            margin-bottom: 15px;
            opacity: 0.4;
        }
        .no-agent .message {
            font-size: 0.9em;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
    }
}

// =============================================================================
// メインコントローラー
// =============================================================================

class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private dashboardPanel: vscode.WebviewPanel | undefined;
    private logs: string[] = [];
    private context: vscode.ExtensionContext | undefined;
    private workspaceRoot: string | undefined;
    private maidAgentPath: string | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private agentPanelProvider: AgentPanelProvider | undefined;
    private tmuxManager: TmuxManager | undefined;
    private tmuxViewerTerminal: vscode.Terminal | undefined;  // tmuxセッション表示用
    private tmuxSessionName: string = '';  // ワークスペース固有のセッション名
    private tmuxWindowPollingInterval: NodeJS.Timeout | undefined;  // tmuxウィンドウ監視用
    private lastDetectedAgentId: string | null = null;  // 前回検出したエージェントID
    private statusBarItem: vscode.StatusBarItem | undefined;  // ステータスバー通知用
    private statusBarResetTimeout: NodeJS.Timeout | undefined;  // ステータスバー表示リセット用

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);
            // ワークスペースパスからセッション名を生成（ディレクトリ名 + 短いハッシュ）
            this.tmuxSessionName = getSessionNameFromPath(this.workspaceRoot);
            this.tmuxManager = new TmuxManager(this.tmuxSessionName, this.workspaceRoot);
        }
    }

    /**
     * 現在のtmuxセッション名を取得
     */
    getTmuxSessionName(): string {
        return this.tmuxSessionName;
    }

    setAgentPanelProvider(provider: AgentPanelProvider): void {
        this.agentPanelProvider = provider;
        // ログ出力用に outputChannel を共有
        provider.setOutputChannel(this.outputChannel);
    }

    setStatusBarItem(item: vscode.StatusBarItem): void {
        this.statusBarItem = item;
    }

    /**
     * ステータスバーに一時的なメッセージを表示（5秒後に元に戻る）
     */
    private showStatusBarNotification(icon: string, message: string): void {
        if (!this.statusBarItem) return;

        // 既存のリセットタイマーをクリア
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // ステータスバーを更新
        this.statusBarItem.text = `${icon} ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        // 5秒後に元に戻す
        this.statusBarResetTimeout = setTimeout(() => {
            if (this.statusBarItem) {
                this.statusBarItem.text = '🎩 Controller';
                this.statusBarItem.backgroundColor = undefined;
            }
        }, 5000);
    }

    // エージェントパネルを更新
    private updateAgentPanel(): void {
        if (this.agentPanelProvider) {
            this.agentPanelProvider.setAgents(this.agents);
        }
    }

    // ターミナル名からエージェントIDを取得
    getAgentIdFromTerminal(terminal: vscode.Terminal): string | null {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                return id;
            }
        }
        return null;
    }

    /**
     * tmuxの現在のウィンドウ名からエージェントIDを取得
     */
    private getCurrentTmuxWindowAgent(): string | null {
        if (!this.tmuxManager || !this.tmuxSessionName) {
            return null;
        }

        try {
            // Windows環境では wsl tmux を使用
            const tmuxCmd = CURRENT_ENV === 'windows-native' ? 'wsl tmux' : 'tmux';
            const result = require('child_process').execSync(
                `${tmuxCmd} display-message -t "${this.tmuxSessionName}" -p "#{window_name}"`,
                { encoding: 'utf-8', timeout: 1000 }
            ).trim();

            // ウィンドウ名がエージェントIDと一致するか確認
            if (this.agents.has(result)) {
                return result;
            }

            // デバッグ: ウィンドウ名が見つかったが登録エージェントに存在しない場合
            // (一時的なログ - 安定したら削除可能)
            const registeredAgents = Array.from(this.agents.keys()).join(', ');
            this.log(`[AgentPanel] ウィンドウ '${result}' は登録エージェントに存在しません (登録: ${registeredAgents || 'なし'})`);
        } catch {
            // tmuxコマンドが失敗した場合は無視（ポーリング中は頻繁に呼ばれるためログ省略）
        }
        return null;
    }

    // 現在のエージェントを設定（パネル更新用）
    setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
        if (!this.agentPanelProvider) return;

        if (!terminal) {
            this.stopTmuxWindowPolling();
            this.agentPanelProvider.setCurrentAgent(null);
            return;
        }

        // まず従来の方式を試す
        let agentId = this.getAgentIdFromTerminal(terminal);

        // tmuxビューアターミナルの場合、tmuxのウィンドウ名から特定 + ポーリング開始
        const isTmuxViewer = terminal === this.tmuxViewerTerminal;
        const terminalName = terminal.name;

        if (!agentId && isTmuxViewer) {
            agentId = this.getCurrentTmuxWindowAgent();
            this.startTmuxWindowPolling();
        } else if (!agentId && terminalName.includes('Maid Agent')) {
            // ターミナル名でtmuxビューアを判定（参照比較の代替）
            this.log(`[AgentPanel] tmuxビューア検出（名前ベース）: ${terminalName}`);
            agentId = this.getCurrentTmuxWindowAgent();
            this.startTmuxWindowPolling();
        } else {
            this.stopTmuxWindowPolling();
        }

        this.agentPanelProvider.setCurrentAgent(agentId);
    }

    /**
     * tmuxウィンドウのポーリングを開始（500msごとにチェック）
     */
    private startTmuxWindowPolling(): void {
        if (this.tmuxWindowPollingInterval) return; // 既に実行中

        this.tmuxWindowPollingInterval = setInterval(() => {
            const currentAgentId = this.getCurrentTmuxWindowAgent();

            // 変更があった場合のみ更新
            if (currentAgentId !== this.lastDetectedAgentId) {
                this.log(`[AgentPanel] tmuxウィンドウ変更検出: ${this.lastDetectedAgentId} → ${currentAgentId}`);
                this.lastDetectedAgentId = currentAgentId;
                if (this.agentPanelProvider) {
                    this.agentPanelProvider.setCurrentAgent(currentAgentId);
                }
            }
        }, 500);

        this.log('[tmux] ウィンドウ監視ポーリングを開始');
    }

    /**
     * tmuxウィンドウのポーリングを停止
     */
    private stopTmuxWindowPolling(): void {
        if (this.tmuxWindowPollingInterval) {
            clearInterval(this.tmuxWindowPollingInterval);
            this.tmuxWindowPollingInterval = undefined;
            this.lastDetectedAgentId = null;
            this.log('[tmux] ウィンドウ監視ポーリングを停止');
        }
    }

    // =========================================================================
    // 初期化
    // =========================================================================

    async initializeWorkspace(): Promise<boolean> {
        if (!this.workspaceRoot) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません');
            return false;
        }

        const maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);

        if (fs.existsSync(maidAgentPath)) {
            // 上書きされるフォルダを確認
            const overwriteDirs = ['instructions', 'bin'];
            const existingOverwriteDirs = overwriteDirs.filter(dir =>
                fs.existsSync(path.join(maidAgentPath, dir))
            );

            let message = `.maid-agent ディレクトリは既に存在します。再初期化しますか？`;
            if (existingOverwriteDirs.length > 0) {
                message += `\n\n⚠️ 以下のフォルダは上書きされます:\n${existingOverwriteDirs.map(d => `  - ${d}/`).join('\n')}`;
            }

            const choice = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                '再初期化', 'キャンセル'
            );
            if (choice !== '再初期化') {
                return false;
            }
        }

        try {
            // テンプレートからコピー
            const extensionPath = this.context?.extensionPath;
            if (!extensionPath) {
                throw new Error('拡張機能のパスが取得できません');
            }

            const templatesPath = path.join(extensionPath, 'project-templates');
            this.log(`[初期化] extensionPath: ${extensionPath}`);
            this.log(`[初期化] templatesPath: ${templatesPath}`);
            this.log(`[初期化] project-templates存在: ${fs.existsSync(templatesPath)}`);

            // project-templates/system/resources/images の確認
            const templatesImagesPath = path.join(templatesPath, 'system', 'resources', 'images');
            this.log(`[初期化] templates/system/resources/images存在: ${fs.existsSync(templatesImagesPath)}`);
            if (fs.existsSync(templatesImagesPath)) {
                const imageFiles = fs.readdirSync(templatesImagesPath);
                this.log(`[初期化] templates/system/resources/images内容: ${imageFiles.join(', ')}`);
            }

            // ディレクトリ構造を作成
            this.copyDirectorySync(templatesPath, maidAgentPath);

            // コピー後の確認
            const destImagesPath = path.join(maidAgentPath, 'system', 'resources', 'images');
            this.log(`[初期化] .maid-agent/system/resources/images存在: ${fs.existsSync(destImagesPath)}`);
            if (fs.existsSync(destImagesPath)) {
                const copiedImages = fs.readdirSync(destImagesPath);
                this.log(`[初期化] .maid-agent/system/resources/images内容: ${copiedImages.join(', ')}`);
            }

            // master/reports ディレクトリに各メイド用のファイルを作成
            const reportsPath = path.join(maidAgentPath, 'master', 'reports');
            if (!fs.existsSync(reportsPath)) {
                fs.mkdirSync(reportsPath, { recursive: true });
            }
            for (const maid of MAIDS) {
                const reportFile = path.join(reportsPath, `${maid.id}.md`);
                if (!fs.existsSync(reportFile)) {
                    fs.writeFileSync(reportFile, `# 作業報告 - ${maid.name}\n\n(報告なし)\n`);
                }
            }

            // プロジェクトルートの CLAUDE.md を処理
            await this.setupRootClaudeMd();

            // グローバル設定のマージ（ルール・スキルの選択）
            await this.mergeGlobalSettings(maidAgentPath);

            // .mcp.json を生成（MCPサーバー接続設定）
            await this.generateMcpJson();

            this.log('[初期化] .maid-agent ディレクトリを作成しました');
            vscode.window.showInformationMessage('🎩 Maid Agent の初期化が完了しました');

            return true;
        } catch (error) {
            this.log(`[ERROR] 初期化に失敗: ${error}`);
            vscode.window.showErrorMessage(`初期化に失敗しました: ${error}`);
            return false;
        }
    }

    /**
     * WSL2の状態をチェックし、必要に応じてセットアップを案内
     * @returns true: WSL準備完了、false: 再起動等が必要
     */
    private async checkAndSetupWsl(): Promise<boolean> {
        this.log('[WSL] チェック開始');

        // 1. WSL2がインストールされているかチェック
        try {
            execSync('wsl.exe --version', { encoding: 'utf-8', stdio: 'pipe' });
            this.log('[WSL] WSL2 確認OK');
        } catch {
            this.log('[WSL] WSL2 未インストール');

            const choice = await vscode.window.showWarningMessage(
                'WSL2がインストールされていません。インストールしますか？（管理者権限が必要です）',
                'インストールする',
                'キャンセル'
            );

            if (choice === 'インストールする') {
                try {
                    // 管理者権限でwsl --installを実行
                    execSync('powershell -Command "Start-Process wsl -ArgumentList \'--install --no-launch\' -Verb RunAs -Wait"', {
                        encoding: 'utf-8',
                        stdio: 'pipe'
                    });

                    await vscode.window.showInformationMessage(
                        '✅ WSL2のインストールを開始しました。\n\n' +
                        '**PCを再起動してから、再度 Init Global を実行してください。**',
                        { modal: true }
                    );
                } catch (error) {
                    this.log(`[WSL] インストール失敗: ${error}`);
                    vscode.window.showErrorMessage(
                        'WSL2のインストールに失敗しました。\n' +
                        'PowerShell（管理者）で以下を実行してください:\n' +
                        'wsl --install'
                    );
                }
            }
            return false;
        }

        // 2. Ubuntuディストロがインストールされているかチェック
        try {
            const distros = execSync('wsl.exe -l -q', { encoding: 'utf-8' })
                .replace(/\0/g, '')
                .split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            this.log(`[WSL] ディストロ一覧: ${distros.join(', ')}`);

            if (distros.length === 0) {
                this.log('[WSL] ディストロなし');

                const choice = await vscode.window.showWarningMessage(
                    'WSL用のLinuxディストリビューションがありません。Ubuntuをインストールしますか？',
                    'インストールする',
                    'キャンセル'
                );

                if (choice === 'インストールする') {
                    try {
                        execSync('powershell -Command "Start-Process wsl -ArgumentList \'--install -d Ubuntu --no-launch\' -Verb RunAs -Wait"', {
                            encoding: 'utf-8',
                            stdio: 'pipe'
                        });

                        await vscode.window.showInformationMessage(
                            '✅ Ubuntuのインストールを開始しました。\n\n' +
                            '**PCを再起動してから、再度 Init Global を実行してください。**\n\n' +
                            '再起動後、Ubuntuを起動してユーザー名とパスワードを設定してください。',
                            { modal: true }
                        );
                    } catch (error) {
                        this.log(`[WSL] Ubuntu インストール失敗: ${error}`);
                        vscode.window.showErrorMessage(
                            'Ubuntuのインストールに失敗しました。\n' +
                            'PowerShell（管理者）で以下を実行してください:\n' +
                            'wsl --install -d Ubuntu'
                        );
                    }
                }
                return false;
            }
        } catch (error) {
            this.log(`[WSL] ディストロ確認失敗: ${error}`);
            vscode.window.showErrorMessage('WSLの状態を確認できませんでした');
            return false;
        }

        // 3. WSLが正常に動作するかチェック
        try {
            execSync("wsl bash -c 'echo ok'", { encoding: 'utf-8', stdio: 'pipe' });
            this.log('[WSL] 動作確認OK');
        } catch {
            this.log('[WSL] WSL動作不可');

            await vscode.window.showWarningMessage(
                'WSLが正常に動作していません。\n\n' +
                '以下を確認してください:\n' +
                '1. Ubuntuを一度起動してユーザー設定を完了\n' +
                '2. PCを再起動\n\n' +
                'その後、再度 Init Global を実行してください。',
                { modal: true }
            );
            return false;
        }

        this.log('[WSL] 全チェックOK');
        return true;
    }

    /**
     * グローバル設定フォルダを初期化
     */
    async initializeGlobalSettings(): Promise<boolean> {
        this.log(`[グローバル] 初期化開始`);

        // Windows環境ではWSL2のチェックを行う
        if (CURRENT_ENV === 'windows-native') {
            const wslReady = await this.checkAndSetupWsl();
            if (!wslReady) {
                return false; // WSL未設定、再起動が必要
            }
        }

        const globalPath = getGlobalMaidAgentPath();
        this.log(`[グローバル] globalPath: ${globalPath}`);

        try {
            // 進捗表示付きで実行
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'グローバル設定を初期化中...',
                cancellable: false
            }, async (progress) => {
                // 拡張機能のパスを取得
                const extensionPath = this.context?.extensionPath;
                if (!extensionPath) {
                    throw new Error('拡張機能のパスが取得できません');
                }

                const globalTemplatesPath = path.join(extensionPath, 'global-templates');
                this.log(`[グローバル] globalTemplatesPath: ${globalTemplatesPath}`);
                this.log(`[グローバル] global-templates存在: ${fs.existsSync(globalTemplatesPath)}`);

                progress.report({ message: 'フォルダを作成中...' });

                // global-templates からコピー（maid-agent-messenger の dist を含む）
                if (fs.existsSync(globalTemplatesPath)) {
                    try {
                        this.copyDirectorySync(globalTemplatesPath, globalPath, true, { includeDist: true });
                        this.log(`[グローバル] global-templates からコピー完了`);
                    } catch (copyError) {
                        const message = copyError instanceof Error ? copyError.message : String(copyError);
                        this.log(`[ERROR] コピー失敗: ${message}`);
                        vscode.window.showErrorMessage(`フォルダのコピーに失敗しました: ${message}`);
                        throw copyError;
                    }
                } else {
                    // フォールバック: 手動でディレクトリ構造を作成
                    this.log(`[グローバル] global-templates が見つからないため、手動で構造を作成`);
                    const dirs = [
                        '',
                        'rules',
                        'rules/common',
                        'rules/butler',
                        'rules/chief',
                        'rules/maid',
                        'skills',
                        'maid-agent-messenger'
                    ];

                    for (const dir of dirs) {
                        const fullPath = path.join(globalPath, dir);
                        if (!fs.existsSync(fullPath)) {
                            fs.mkdirSync(fullPath, { recursive: true });
                        }
                    }
                }

                // コピー後の検証
                if (!fs.existsSync(globalPath)) {
                    throw new Error(`フォルダが作成されませんでした: ${globalPath}`);
                }

                this.log(`[グローバル] 設定フォルダを初期化: ${globalPath}`);

                // MCPサーバー (maid-agent-messenger) のセットアップ
                if (CURRENT_ENV === 'windows-native') {
                    progress.report({ message: 'MCPサーバーをセットアップ中...' });
                    await this.setupMcpServer();
                }

                return true;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`[ERROR] グローバル設定の初期化に失敗: ${message}`);
            vscode.window.showErrorMessage(`グローバル設定の初期化に失敗しました: ${message}`);
            return false;
        }
    }

    // セットアップ中に取得したWSLパスワード（一時保持）
    private cachedWslPassword: string | undefined;

    /**
     * MCPサーバー (maid-agent-messenger) をセットアップ
     * - pm2 インストール確認（なければ自動インストール）
     * - npm install
     * - pm2 start + save
     * - pm2 startup (オプション、sudo必要)
     */
    private async setupMcpServer(): Promise<void> {
        const messengerPath = '~/.maid-agent/maid-agent-messenger';
        this.cachedWslPassword = undefined; // 初期化

        try {
            // 進捗表示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'MCPサーバーをセットアップ中...',
                cancellable: false
            }, async (progress) => {
                // 0. pm2 インストール確認
                progress.report({ message: 'pm2 を確認中...' });
                try {
                    execSync(`wsl bash -c 'which pm2'`, { encoding: 'utf-8', stdio: 'pipe' });
                    this.log('[MCP] pm2 確認OK');
                } catch {
                    // pm2がない場合は自動インストール（sudo必要）
                    this.log('[MCP] pm2 が見つかりません。インストールします...');

                    const password = await this.installPm2WithSudo();
                    if (!password) {
                        throw new Error('pm2 のインストールがキャンセルされました');
                    }
                    // パスワードをキャッシュ（startup設定で再利用）
                    this.cachedWslPassword = password;
                }

                // 1. npm install
                progress.report({ message: 'npm install 実行中...' });
                try {
                    execSync(`wsl bash -c "cd ${messengerPath} && npm install"`, {
                        encoding: 'utf-8',
                        timeout: 120000 // 2分タイムアウト
                    });
                    this.log('[MCP] npm install 完了');
                } catch (error) {
                    this.log(`[MCP] npm install 失敗: ${error}`);
                    throw new Error('npm install に失敗しました');
                }

                // 2. pm2 start
                progress.report({ message: 'pm2 でサーバー起動中...' });
                try {
                    // 既存のプロセスがあれば削除
                    try {
                        execSync(`wsl bash -c "pm2 delete maid-agent-messenger 2>/dev/null || true"`, {
                            encoding: 'utf-8'
                        });
                    } catch { /* ignore */ }

                    execSync(`wsl bash -c "cd ${messengerPath} && pm2 start ecosystem.config.cjs"`, {
                        encoding: 'utf-8'
                    });
                    this.log('[MCP] pm2 start 完了');
                } catch (error) {
                    this.log(`[MCP] pm2 start 失敗: ${error}`);
                    throw new Error('pm2 start に失敗しました');
                }

                // 3. pm2 save
                progress.report({ message: 'pm2 状態を保存中...' });
                try {
                    execSync(`wsl bash -c "pm2 save"`, { encoding: 'utf-8' });
                    this.log('[MCP] pm2 save 完了');
                } catch (error) {
                    this.log(`[MCP] pm2 save 失敗: ${error}`);
                    // saveの失敗は致命的ではないので続行
                }
            });

            vscode.window.showInformationMessage('✅ MCPサーバーを起動しました');

            // 4. 自動起動設定の確認（キャッシュしたパスワードを渡す）
            await this.setupPm2Startup(this.cachedWslPassword);

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`MCPサーバーのセットアップに失敗: ${message}`);
            this.log(`[ERROR] MCPサーバーセットアップ失敗: ${error}`);
        } finally {
            // セキュリティ: パスワードをクリア
            this.cachedWslPassword = undefined;
        }
    }

    /**
     * WSLパスワードを取得（説明ダイアログ付き）
     */
    private async promptWslPassword(purpose: string, attempt: number, maxAttempts: number): Promise<string | undefined> {
        // 初回は説明ダイアログを表示
        if (attempt === 1) {
            const proceed = await vscode.window.showInformationMessage(
                `${purpose}\n\nWSL (Ubuntu) のパスワード入力が必要です。\n（Windows のパスワードではありません）`,
                { modal: true },
                'パスワードを入力'
            );
            if (proceed !== 'パスワードを入力') {
                return undefined;
            }
        }

        return await vscode.window.showInputBox({
            prompt: attempt > 1
                ? `パスワードが正しくありません（残り${maxAttempts - attempt + 1}回）`
                : 'WSL (Ubuntu) のパスワード',
            password: true,
            placeHolder: 'Ubuntu 初回起動時に設定したパスワード',
            ignoreFocusOut: true
        });
    }

    /**
     * pm2をsudo付きでインストール
     * @returns パスワード（成功時）、undefined（キャンセルまたは失敗）
     */
    private async installPm2WithSudo(): Promise<string | undefined> {
        const MAX_ATTEMPTS = 3;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const password = await this.promptWslPassword('pm2 のインストール', attempt, MAX_ATTEMPTS);

            if (password === undefined) {
                this.log('[MCP] pm2 インストールがキャンセルされました');
                return undefined;
            }

            try {
                const escapedPassword = password.replace(/'/g, "'\\''");

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'pm2 をインストール中...',
                    cancellable: false
                }, async () => {
                    execSync(
                        `wsl bash -c "echo '${escapedPassword}' | sudo -S npm install -g pm2 2>&1"`,
                        { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }
                    );
                });

                this.log('[MCP] pm2 インストール完了');
                vscode.window.showInformationMessage('✅ pm2 をインストールしました');
                return password; // 成功時はパスワードを返す
            } catch (error) {
                this.log(`[MCP] pm2 インストール試行 ${attempt} 失敗: ${error}`);
            }
        }

        vscode.window.showErrorMessage(
            'pm2 のインストールに失敗しました。\n' +
            'WSL で以下を手動実行してください:\n' +
            'sudo npm install -g pm2'
        );
        return undefined;
    }

    /**
     * pm2 startup を設定（WSL起動時の自動起動）
     * @param cachedPassword 既に取得済みのパスワード（あれば再利用）
     */
    private async setupPm2Startup(cachedPassword?: string): Promise<void> {
        const choice = await vscode.window.showInformationMessage(
            'MCPサーバーの自動起動を設定しますか？\n（WSL起動時に自動で起動します）',
            '設定する',
            'スキップ'
        );

        if (choice !== '設定する') {
            this.log('[MCP] pm2 startup をスキップ');
            return;
        }

        // pm2 startup コマンドを取得
        // 注意: pm2 startup はexit code 1を返すことがあるが、出力は正常
        let startupCommand: string;
        try {
            let output: string;
            try {
                output = execSync(`wsl bash -c "pm2 startup 2>&1"`, { encoding: 'utf-8' });
            } catch (execError: unknown) {
                if (execError && typeof execError === 'object' && 'stdout' in execError) {
                    output = (execError as { stdout: string }).stdout || '';
                } else if (execError && typeof execError === 'object' && 'message' in execError) {
                    const msg = (execError as Error).message;
                    output = msg;
                } else {
                    throw execError;
                }
            }

            this.log(`[MCP] pm2 startup 出力: ${output}`);

            const match = output.match(/sudo .+$/m);
            if (!match) {
                if (output.includes('already')) {
                    vscode.window.showInformationMessage('自動起動は既に設定されています');
                    return;
                }
                throw new Error('startup コマンドを取得できませんでした');
            }
            startupCommand = match[0];
            this.log(`[MCP] startup コマンド: ${startupCommand}`);
        } catch (error) {
            this.log(`[MCP] pm2 startup 取得失敗: ${error}`);
            vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
            return;
        }

        // パスワード入力（キャッシュがあれば使用、なければ新規取得）
        const maxAttempts = 3;
        let password = cachedPassword;
        let attempts = 0;

        while (attempts < maxAttempts) {
            // キャッシュがない場合のみ入力を求める
            if (!password) {
                password = await this.promptWslPassword('自動起動の設定', attempts + 1, maxAttempts);
                if (!password) {
                    await this.showPasswordHelp();
                    return;
                }
            }

            try {
                const escapedPassword = password.replace(/'/g, "'\\''");
                // sudo と env PATH=... の部分を除去（pm2は絶対パスで指定されているので不要）
                let command = startupCommand
                    .replace(/^sudo\s+/, '')
                    .replace(/env\s+PATH=[^\s]+\s+/, '');
                this.log(`[MCP] 実行コマンド: ${command}`);
                execSync(
                    `wsl bash -c "echo '${escapedPassword}' | sudo -S ${command}"`,
                    { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' }
                );
                this.log('[MCP] pm2 startup 設定完了');
                vscode.window.showInformationMessage('✅ 自動起動を設定しました');
                return;
            } catch (error) {
                attempts++;
                this.log(`[MCP] pm2 startup 失敗 (${attempts}/${maxAttempts}): ${error}`);
                password = undefined; // 次回は新規入力
            }
        }

        vscode.window.showErrorMessage('パスワードの認証に失敗しました。手動で設定してください。');
        await this.showPasswordHelp();
    }

    /**
     * パスワードのヘルプを表示
     */
    private async showPasswordHelp(): Promise<void> {
        const help = await vscode.window.showInformationMessage(
            'パスワードを忘れた場合は、管理者権限のPowerShellで「wsl -u root」→「passwd ユーザー名」でリセットできます',
            'OK',
            'リセット方法を詳しく見る'
        );

        if (help !== 'リセット方法を詳しく見る') {
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'passwordHelp',
            'WSLパスワードのリセット方法',
            vscode.ViewColumn.One,
            {}
        );
        panel.webview.html = this.getPasswordHelpHtml();
    }

    /**
     * パスワードヘルプのHTML
     */
    private getPasswordHelpHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                    pre { background: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>WSLパスワードのリセット方法</h1>
                <ol>
                    <li>PowerShell を<strong>管理者として</strong>起動</li>
                    <li>以下のコマンドを実行:
                        <pre>wsl -u root</pre>
                    </li>
                    <li>rootでログインしたら、パスワードをリセット:
                        <pre>passwd ユーザー名</pre>
                        ※ユーザー名は <code>whoami</code> で確認できます
                    </li>
                    <li>新しいパスワードを2回入力</li>
                    <li><code>exit</code> でrootを終了</li>
                    <li>再度 Init Global を実行</li>
                </ol>
            </body>
            </html>
        `;
    }

    /**
     * グローバルルールのメタデータを読み込み
     */
    private parseRuleModules(): RuleModuleMeta[] {
        const globalPath = getGlobalMaidAgentPath();
        const rulesPath = path.join(globalPath, 'rules');
        const rules: RuleModuleMeta[] = [];

        if (!fs.existsSync(rulesPath)) {
            return rules;
        }

        const roleTypes: ('common' | 'butler' | 'chief' | 'maid')[] = ['common', 'butler', 'chief', 'maid'];

        for (const role of roleTypes) {
            const rolePath = path.join(rulesPath, role);
            if (!fs.existsSync(rolePath)) continue;

            const files = fs.readdirSync(rolePath).filter(f => f.endsWith('.md') && f !== 'README.md');

            for (const file of files) {
                const filePath = path.join(rolePath, file);
                const meta = this.parseMarkdownFrontmatter(filePath);

                if (meta) {
                    rules.push({
                        name: (meta.name as string) || file.replace('.md', ''),
                        description: (meta.description as string) || '',
                        auto_select: meta.auto_select === true,
                        target_roles: (meta.target_roles as RuleModuleMeta['target_roles']) || [role],
                        filePath
                    });
                }
            }
        }

        return rules;
    }

    /**
     * グローバルスキルのメタデータを読み込み
     */
    private parseGlobalSkills(): SkillMeta[] {
        const globalPath = getGlobalMaidAgentPath();
        const skillsPath = path.join(globalPath, 'skills');
        const skills: SkillMeta[] = [];

        if (!fs.existsSync(skillsPath)) {
            return skills;
        }

        const items = fs.readdirSync(skillsPath);

        for (const item of items) {
            const itemPath = path.join(skillsPath, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory()) {
                // フォルダ形式のスキル（SKILL.md を含む）
                const skillMdPath = path.join(itemPath, 'SKILL.md');
                if (fs.existsSync(skillMdPath)) {
                    const meta = this.parseMarkdownFrontmatter(skillMdPath);
                    skills.push({
                        name: (meta?.name as string) || item,
                        description: (meta?.description as string) || '',
                        auto_select: meta?.auto_select === true,
                        filePath: itemPath
                    });
                }
            } else if (item.endsWith('.md') && item !== 'README.md') {
                // 単一ファイル形式のスキル
                const meta = this.parseMarkdownFrontmatter(itemPath);
                skills.push({
                    name: (meta?.name as string) || item.replace('.md', ''),
                    description: (meta?.description as string) || '',
                    auto_select: meta?.auto_select === true,
                    filePath: itemPath
                });
            }
        }

        return skills;
    }

    /**
     * Markdown ファイルの frontmatter を解析
     */
    private parseMarkdownFrontmatter(filePath: string): Record<string, unknown> | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const match = content.match(/^---\n([\s\S]*?)\n---/);

            if (!match) return null;

            const frontmatter = match[1];
            const result: Record<string, unknown> = {};

            // 簡易YAML解析
            const lines = frontmatter.split('\n');
            for (const line of lines) {
                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const key = line.substring(0, colonIndex).trim();
                    let value: unknown = line.substring(colonIndex + 1).trim();

                    // 配列の解析 [a, b, c]
                    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
                        value = value.slice(1, -1).split(',').map(s => s.trim());
                    }
                    // booleanの解析
                    else if (value === 'true') value = true;
                    else if (value === 'false') value = false;

                    result[key] = value;
                }
            }

            return result;
        } catch {
            return null;
        }
    }

    /**
     * グローバルルール/スキルの選択UIを表示してマージ
     */
    private async mergeGlobalSettings(maidAgentPath: string): Promise<void> {
        const globalPath = getGlobalMaidAgentPath();

        // グローバルフォルダが存在しない場合は初期化
        if (!fs.existsSync(globalPath)) {
            await this.initializeGlobalSettings();
        }

        // ルールの選択
        const rules = this.parseRuleModules();
        if (rules.length > 0) {
            const selectedRules = await this.showRuleSelectionUI(rules);
            if (selectedRules.length > 0) {
                await this.copySelectedRules(selectedRules, maidAgentPath);
            }
        }

        // スキルの選択
        const skills = this.parseGlobalSkills();
        if (skills.length > 0) {
            const selectedSkills = await this.showSkillSelectionUI(skills);
            if (selectedSkills.length > 0) {
                await this.copySelectedSkills(selectedSkills, maidAgentPath);
            }
        }

        // テンプレートのコピー（グローバルに存在すれば自動コピー）
        await this.copyGlobalTemplates(globalPath, maidAgentPath);
    }

    /**
     * グローバルテンプレートをプロジェクトにコピー
     */
    private async copyGlobalTemplates(globalPath: string, maidAgentPath: string): Promise<void> {
        const globalReportsPath = path.join(globalPath, 'reports');
        const globalTemplatePath = path.join(globalReportsPath, 'current_template.md');

        // グローバルテンプレートが存在しない場合はスキップ
        if (!fs.existsSync(globalTemplatePath)) {
            return;
        }

        // プロジェクトの master/reports フォルダを作成（なければ）
        const destReportsPath = path.join(maidAgentPath, 'master', 'reports');
        if (!fs.existsSync(destReportsPath)) {
            fs.mkdirSync(destReportsPath, { recursive: true });
        }

        // テンプレートをコピー
        const destTemplatePath = path.join(destReportsPath, 'current_template.md');
        fs.copyFileSync(globalTemplatePath, destTemplatePath);
        this.log('[グローバル] テンプレートをコピー: current_template.md');
    }

    /**
     * .mcp.json をプロジェクトルートに生成または追記
     * MCPサーバー接続設定（プロジェクトパス含む）
     */
    private async generateMcpJson(): Promise<void> {
        if (!this.workspaceRoot) return;

        const mcpJsonPath = path.join(this.workspaceRoot, '.mcp.json');
        const serverName = 'maid-agent-messenger';

        // プロジェクトパスを取得（Windows環境ではWSLパスに変換）
        const projectPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(this.workspaceRoot)
            : this.workspaceRoot;

        const maidAgentServerConfig = {
            type: "http",
            url: "http://localhost:3100/mcp",
            headers: {
                "X-Maid-Project-Path": projectPath
            }
        };

        // 既存ファイルがある場合
        if (fs.existsSync(mcpJsonPath)) {
            try {
                const existingContent = fs.readFileSync(mcpJsonPath, 'utf-8');
                const existingConfig = JSON.parse(existingContent) as {
                    mcpServers?: Record<string, unknown>;
                };

                // mcpServers が存在しない場合は追加
                if (!existingConfig.mcpServers) {
                    existingConfig.mcpServers = {};
                }

                // 既に maid-agent-messenger が存在する場合はスキップ
                if (existingConfig.mcpServers[serverName]) {
                    this.log(`[MCP] ${serverName} は既に設定済みのためスキップ`);
                    return;
                }

                // ユーザーに確認
                const choice = await vscode.window.showInformationMessage(
                    `.mcp.json に ${serverName} を追加しますか？`,
                    '追加する',
                    'スキップ'
                );

                if (choice !== '追加する') {
                    this.log('[MCP] ユーザーがキャンセルしました');
                    return;
                }

                // 追記
                existingConfig.mcpServers[serverName] = maidAgentServerConfig;
                fs.writeFileSync(mcpJsonPath, JSON.stringify(existingConfig, null, 2));
                this.log(`[MCP] ${serverName} を .mcp.json に追加しました`);

            } catch (error) {
                // JSONパースエラーなど
                this.log(`[MCP] .mcp.json の読み込みに失敗: ${error}`);
                vscode.window.showWarningMessage(
                    `.mcp.json の読み込みに失敗しました。手動で ${serverName} を追加してください。`
                );
            }
            return;
        }

        // 新規作成
        const mcpConfig = {
            mcpServers: {
                [serverName]: maidAgentServerConfig
            }
        };

        fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
        this.log(`[MCP] .mcp.json を生成: ${mcpJsonPath}`);
    }

    /**
     * ルール選択UIを表示
     */
    private async showRuleSelectionUI(rules: RuleModuleMeta[]): Promise<RuleModuleMeta[]> {
        const items = rules.map(rule => ({
            label: rule.name,
            description: rule.description,
            detail: `対象: ${rule.target_roles.join(', ')}`,
            picked: rule.auto_select,
            rule
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'グローバルルールを選択（ESCでスキップ）',
            title: '📋 グローバルルールの追加'
        });

        return selected?.map(item => item.rule) || [];
    }

    /**
     * スキル選択UIを表示
     */
    private async showSkillSelectionUI(skills: SkillMeta[]): Promise<SkillMeta[]> {
        const items = skills.map(skill => ({
            label: skill.name,
            description: skill.description,
            picked: skill.auto_select,
            skill
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'グローバルスキルを選択（ESCでスキップ）',
            title: '📚 グローバルスキルの追加'
        });

        return selected?.map(item => item.skill) || [];
    }

    /**
     * 選択されたルールをプロジェクトにコピー
     */
    private async copySelectedRules(rules: RuleModuleMeta[], maidAgentPath: string): Promise<void> {
        const rulesDestPath = path.join(maidAgentPath, 'agents', 'rules');

        // rules フォルダがなければ作成
        if (!fs.existsSync(rulesDestPath)) {
            fs.mkdirSync(rulesDestPath, { recursive: true });
        }

        for (const rule of rules) {
            const fileName = path.basename(rule.filePath);

            // 各ターゲットロールのフォルダにコピー
            for (const role of rule.target_roles) {
                const roleDestPath = path.join(rulesDestPath, role);
                if (!fs.existsSync(roleDestPath)) {
                    fs.mkdirSync(roleDestPath, { recursive: true });
                }

                const destPath = path.join(roleDestPath, fileName);
                fs.copyFileSync(rule.filePath, destPath);
            }

            this.log(`[グローバル] ルールをコピー: ${rule.name}`);
        }
    }

    /**
     * 選択されたスキルをプロジェクトにコピー
     */
    private async copySelectedSkills(skills: SkillMeta[], maidAgentPath: string): Promise<void> {
        const skillsDestPath = path.join(maidAgentPath, 'agents', 'skills');

        for (const skill of skills) {
            const stat = fs.statSync(skill.filePath);

            if (stat.isDirectory()) {
                // フォルダごとコピー
                const destPath = path.join(skillsDestPath, path.basename(skill.filePath));
                this.copyDirectorySync(skill.filePath, destPath);
            } else {
                // 単一ファイルをコピー
                const destPath = path.join(skillsDestPath, path.basename(skill.filePath));
                fs.copyFileSync(skill.filePath, destPath);
            }

            this.log(`[グローバル] スキルをコピー: ${skill.name}`);
        }
    }

    /**
     * プロジェクトのルールをグローバルに昇格
     */
    async promoteRuleToGlobal(): Promise<void> {
        if (!this.maidAgentPath) {
            vscode.window.showWarningMessage('ワークスペースが初期化されていません');
            return;
        }

        const projectRulesPath = path.join(this.maidAgentPath, 'agents', 'rules');
        if (!fs.existsSync(projectRulesPath)) {
            vscode.window.showWarningMessage('プロジェクトに agents/rules フォルダがありません');
            return;
        }

        const globalPath = getGlobalMaidAgentPath();
        const globalRulesPath = path.join(globalPath, 'rules');

        // グローバルフォルダが存在しない場合は作成
        if (!fs.existsSync(globalRulesPath)) {
            await this.initializeGlobalSettings();
        }

        // プロジェクトのルールファイルを収集
        const roleTypes = ['common', 'butler', 'chief', 'maid'];
        const projectRules: { name: string; role: string; filePath: string }[] = [];
        const globalExisting = new Set<string>();

        // グローバルに既に存在するファイル名を収集
        for (const role of roleTypes) {
            const globalRolePath = path.join(globalRulesPath, role);
            if (fs.existsSync(globalRolePath)) {
                const files = fs.readdirSync(globalRolePath);
                files.forEach(f => globalExisting.add(`${role}/${f}`));
            }
        }

        // プロジェクトのルールを収集（グローバルに存在しないもののみ）
        for (const role of roleTypes) {
            const projectRolePath = path.join(projectRulesPath, role);
            if (fs.existsSync(projectRolePath)) {
                const files = fs.readdirSync(projectRolePath);
                for (const file of files) {
                    if (file.endsWith('.md') && file !== 'README.md' && file !== 'rule-template.md') {
                        const key = `${role}/${file}`;
                        if (!globalExisting.has(key)) {
                            projectRules.push({
                                name: file.replace('.md', ''),
                                role,
                                filePath: path.join(projectRolePath, file)
                            });
                        }
                    }
                }
            }
        }

        if (projectRules.length === 0) {
            vscode.window.showInformationMessage('昇格可能なルールがありません（全てグローバル化済み、またはルールなし）');
            return;
        }

        // 選択UI
        const items = projectRules.map(rule => ({
            label: rule.name,
            description: `[${rule.role}]`,
            detail: rule.filePath,
            rule
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'グローバルに昇格するルールを選択',
            title: '📋 ルールをグローバルに昇格'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        // コピー実行
        for (const item of selected) {
            const globalRolePath = path.join(globalRulesPath, item.rule.role);
            if (!fs.existsSync(globalRolePath)) {
                fs.mkdirSync(globalRolePath, { recursive: true });
            }

            const destPath = path.join(globalRolePath, path.basename(item.rule.filePath));
            fs.copyFileSync(item.rule.filePath, destPath);
            this.log(`[グローバル] ルールを昇格: ${item.rule.name} → ${item.rule.role}/`);
        }

        vscode.window.showInformationMessage(`🌐 ${selected.length}個のルールをグローバルに昇格しました`);
    }

    /**
     * プロジェクトルートの CLAUDE.md を設定
     * - 存在しない場合: 新規作成
     * - 存在する場合: 先頭に Maid Agent 指示を追記
     */
    private async setupRootClaudeMd(): Promise<void> {
        if (!this.workspaceRoot) return;

        const claudeMdPath = path.join(this.workspaceRoot, 'CLAUDE.md');
        const maidAgentHeader = this.getMaidAgentClaudeHeader();

        if (fs.existsSync(claudeMdPath)) {
            // 既存の CLAUDE.md がある場合
            const existingContent = fs.readFileSync(claudeMdPath, 'utf-8');

            // 既に Maid Agent セクションがある場合はスキップ
            if (existingContent.includes('# Maid Agent System')) {
                this.log('[CLAUDE.md] 既に Maid Agent セクションが存在します');
                return;
            }

            // 先頭に追記するか確認
            const choice = await vscode.window.showWarningMessage(
                'CLAUDE.md が既に存在します。Maid Agent の指示を先頭に追加しますか？',
                '追加する', 'スキップ'
            );

            if (choice === '追加する') {
                const newContent = maidAgentHeader + '\n---\n\n' + existingContent;
                fs.writeFileSync(claudeMdPath, newContent);
                this.log('[CLAUDE.md] 既存ファイルに Maid Agent 指示を追記しました');
            }
        } else {
            // 新規作成
            fs.writeFileSync(claudeMdPath, maidAgentHeader);
            this.log('[CLAUDE.md] 新規作成しました');
        }
    }

    /**
     * CLAUDE.md に追記する Maid Agent 用のヘッダー
     */
    private getMaidAgentClaudeHeader(): string {
        return `# Maid Agent System

このプロジェクトは Maid Agent マルチエージェントシステムで管理されています。

## セッション開始時（必須）

1. Memory MCP で過去の知識グラフを読み込み（利用可能な場合）
2. \`.maid-agent/agents/context/\` でプロジェクト固有情報を確認
3. 自分の役割を確認（下記参照）

## あなたの役割

起動時に自分の役割を確認してください:
- 🎩 執事 (Butler): \`.maid-agent/agents/instructions/butler.md\` を参照
- 👑 メイド長 (Chief Maid): \`.maid-agent/agents/instructions/chief.md\` を参照
- 🎀 メイド (Maid): \`.maid-agent/agents/instructions/maid.md\` を参照

## 階層構造

\`\`\`
ご主人様 (Human)
    ↓
🎩 執事 ──→ 戦略立案・タスク分解
    ↓
👑 メイド長 ──→ タスク配分・進捗管理
    ↓
🎀 メイド×8 ──→ 実作業担当
\`\`\`

## 重要なルール

1. **指揮系統厳守**: 執事→メイド長→メイド の順序を守る
2. **自己実行禁止**: 執事・メイド長は自分で作業しない
3. **報告は dashboard.md**: 上への報告は \`.maid-agent/dashboard.md\` を更新
4. **指示は YAML キュー**: 下への指示は \`.maid-agent/system/data/queue/\` のYAMLファイル経由
5. **sendText 2段階**: 通知時はメッセージとEnterを別々に送信

## ファイル構成

- 詳細設計書: \`.maid-agent/CLAUDE.md\`
- プロジェクトコンテキスト: \`.maid-agent/agents/context/\`
- スキル: \`.maid-agent/agents/skills/\`
`;
    }

    private copyDirectorySync(src: string, dest: string, isRoot: boolean = true, options?: { includeDist?: boolean }): void {
        // 完全スキップ（コピーしない）
        // ※ maid-agent-messenger では dist が必要なので options.includeDist で制御
        const skipDirs = options?.includeDist
            ? ['node_modules', '.git', 'logs']
            : ['node_modules', '.git', 'dist', 'logs'];
        // 保持するディレクトリ（既存フォルダがあればスキップ）
        // ※ agents/instructions, system/bin は上書き対象（ここに含めない）
        // B案構造: master/（ユーザーデータ保持）, 旧構造の名前も互換性のため残す
        const preserveDirs = ['master', 'skills', 'rules', 'images', 'queue', 'config', 'context', 'notifications', 'status', 'reports', 'personas'];

        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                // 完全スキップ
                if (skipDirs.includes(entry.name)) {
                    this.log(`[コピー] スキップ: ${entry.name}`);
                    continue;
                }
                // ルートレベルで保持対象かつ既存なら保持
                if (isRoot && preserveDirs.includes(entry.name) && fs.existsSync(destPath)) {
                    this.log(`[コピー] 既存を保持: ${entry.name}/`);
                    continue;
                }
                this.copyDirectorySync(srcPath, destPath, false, options);
            } else {
                // dashboard.md は存在する場合スキップ（進捗情報を保持）
                if (entry.name === 'dashboard.md' && fs.existsSync(destPath)) {
                    this.log('[初期化] dashboard.md は既存のため保持');
                    continue;
                }
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // =========================================================================
    // エージェント管理
    // =========================================================================

    /**
     * tmuxセッションを初期化
     */
    private initializeTmuxSession(): void {
        if (!this.tmuxManager) return;

        try {
            this.tmuxManager.createSession();
            this.log(`[tmux] セッション '${this.tmuxSessionName}' を作成しました`);

            // セッション名をファイルに保存（maid-notify用）
            this.saveSessionNameToFile();

            // 通知システムを自動開始（ファイル監視含む）- サイレントモード
            this.startWatchingFiles(true);
        } catch (error) {
            this.log(`[tmux] セッション作成エラー: ${error}`);
        }
    }

    /**
     * セッション名をファイルに保存（maid-notify用）
     */
    private saveSessionNameToFile(): void {
        if (!this.maidAgentPath || !this.tmuxSessionName) return;

        try {
            const configDir = path.join(this.maidAgentPath, 'system', 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            const sessionFile = path.join(configDir, '.session-name');
            fs.writeFileSync(sessionFile, this.tmuxSessionName);
            this.log(`[tmux] セッション名を保存: ${sessionFile}`);
        } catch (error) {
            this.log(`[tmux] セッション名保存エラー: ${error}`);
        }
    }

    /**
     * VSCodeターミナルでtmuxセッションにアタッチ（表示用）
     */
    openTmuxViewer(): void {
        if (!this.tmuxManager) return;

        // 既存のビューアがあれば表示
        if (this.tmuxViewerTerminal) {
            this.tmuxViewerTerminal.show();
            return;
        }

        // tmuxセッションがなければ作成
        this.initializeTmuxSession();

        // VSCodeターミナルでtmuxにアタッチ
        if (CURRENT_ENV === 'windows-native') {
            // Windows環境: WSLシェルを使用してtmuxにアタッチ
            const wslPath = this.tmuxManager?.getWslWorkingDirectory() || '/home';
            this.tmuxViewerTerminal = vscode.window.createTerminal({
                name: '🎩 Maid Agent (tmux)',
                shellPath: 'wsl.exe',
                shellArgs: ['-e', 'bash', '-c', `cd "${wslPath}" && tmux attach-session -t ${this.tmuxSessionName}`]
            });
        } else {
            // WSL/Linux/macOS環境: 直接tmuxにアタッチ
            this.tmuxViewerTerminal = vscode.window.createTerminal({
                name: '🎩 Maid Agent (tmux)',
                cwd: this.workspaceRoot
            });
            this.tmuxViewerTerminal.sendText(`tmux attach-session -t ${this.tmuxSessionName}`);
        }
        this.tmuxViewerTerminal.show();

        this.log('[tmux] ビューアターミナルを開きました');
    }

    createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent {
        if (!this.workspaceRoot || !this.tmuxManager) {
            throw new Error('ワークスペースが初期化されていません');
        }

        // tmuxセッションがなければ作成
        this.initializeTmuxSession();

        // tmuxウィンドウを作成
        const windowName = id;
        if (!this.tmuxManager.windowExists(windowName)) {
            this.tmuxManager.createWindow(windowName);
        }

        const agent: Agent = {
            name,
            id,
            tmuxWindow: windowName,
            role,
            status: 'idle'
        };
        this.agents.set(id, agent);

        this.log(`[${name}] 準備完了 (tmux window: ${windowName})`);
        this.updateMasterStatus(id, 'idle');
        this.updateAgentPanel();
        return agent;
    }

    /**
     * エージェントにコマンドを送信（tmux send-keys経由）
     */
    sendToAgent(agentId: string, command: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent || !this.tmuxManager) {
            this.log(`[ERROR] ${agentId} が見つかりません`);
            return false;
        }

        try {
            this.tmuxManager.sendKeys(agent.tmuxWindow, command, true);
            agent.status = 'working';
            this.log(`[${agent.name}] → ${command.substring(0, 60)}...`);
            this.updateMasterStatus(agentId, 'working');
            this.updateDashboard();
            return true;
        } catch (error) {
            this.log(`[ERROR] send-keys失敗: ${error}`);
            return false;
        }
    }

    /**
     * エージェントにメッセージを送信（2段階送信 - Claude Code通知用）
     * multi-agent-shogun準拠: メッセージとEnterを別々に送信
     */
    async sendMessageToAgent(agentId: string, message: string): Promise<boolean> {
        const agent = this.agents.get(agentId);
        if (!agent || !this.tmuxManager) {
            this.log(`[ERROR] ${agentId} が見つかりません`);
            return false;
        }

        try {
            // ステップ0: copy mode（スクロールモード）を解除
            // ユーザーがマウススクロールした場合、入力を受け付けない状態になっている可能性がある
            this.tmuxManager.cancelCopyMode(agent.tmuxWindow);
            await this.delay(50);

            // ステップ1: メッセージ送信（Enterなし）
            this.tmuxManager.sendKeys(agent.tmuxWindow, message, false);

            // 少し待つ（バッファリング対策）
            await this.delay(100);

            // ステップ2: Enter送信
            this.tmuxManager.sendKeys(agent.tmuxWindow, '', true);

            this.log(`[${agent.name}] 📨 ${message.substring(0, 60)}...`);
            return true;
        } catch (error) {
            this.log(`[ERROR] send-keys失敗: ${error}`);
            return false;
        }
    }

    /**
     * エージェントの出力をキャプチャ（tmux capture-pane経由）
     */
    captureAgentOutput(agentId: string, lines: number = 100): string {
        const agent = this.agents.get(agentId);
        if (!agent || !this.tmuxManager) {
            return '';
        }

        return this.tmuxManager.capturePane(agent.tmuxWindow, lines);
    }

    /**
     * エージェントでClaude Codeを起動し、役割を認識させる
     * 初期プロンプトを引数として渡すことで、起動と指示を1コマンドで実行
     */
    async launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
        const agent = this.agents.get(agentId);
        if (!agent || !this.tmuxManager) return;

        // 役割に応じた指示を作成
        // 重要: コンパクション後も通信方法を忘れないよう、QUICK_REFERENCE.md への言及を含める
        let instruction: string;
        switch (role) {
            case 'butler':
                instruction = 'あなたは執事のシルヴィアです。.maid-agent/agents/instructions/butler.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/butler.md を読んで口調・話し方を把握してください。準備ができたら、ご主人様からの指示をお待ちください。';
                break;
            case 'chiefMaid':
                instruction = 'あなたはメイド長のビオラです。.maid-agent/agents/instructions/chief.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/chief.md を読んで口調・話し方を把握してください。準備ができたら、シルヴィア（執事）からの指示をお待ちください。';
                break;
            case 'maid':
                const maidId = agentId;
                instruction = `あなたはメイドの${maidName || 'メイド'}です。.maid-agent/agents/instructions/maid.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/${maidId}.md を読んで口調・話し方を把握してください。準備ができたら、ビオラ（メイド長）からの指示をお待ちください。`;
                break;
        }

        // シェルエスケープ（シングルクォートをエスケープ）
        const escapedInstruction = instruction.replace(/'/g, "'\\''");

        // tmuxウィンドウが準備できるまで待つ
        await this.delay(500);

        // Claude Code を初期プロンプト付きで起動（tmux send-keys経由）
        const command = `claude --dangerously-skip-permissions '${escapedInstruction}'`;
        this.tmuxManager.sendKeys(agent.tmuxWindow, command, true);

        const roleLabel = agent.role === 'butler' ? '執事' :
                         agent.role === 'chiefMaid' ? 'メイド長' : 'メイド';
        this.log(`[${agent.name}] ${roleLabel}をお呼びしました`);

        agent.status = 'idle';
        this.updateAgentPanel();

        // 保留中のメッセージがあれば配信
        await this.deliverPendingMessages(agentId);
    }

    /**
     * エージェント起動時に保留中のメッセージを配信
     */
    private async deliverPendingMessages(agentId: string): Promise<void> {
        if (!this.maidAgentPath) return;

        const pendingFile = path.join(this.maidAgentPath, 'notifications', 'pending', `${agentId}.txt`);

        if (!fs.existsSync(pendingFile)) return;

        try {
            const content = fs.readFileSync(pendingFile, 'utf-8').trim();
            if (!content) return;

            const messages = content.split('\n');
            this.log(`[${agentId}] ${messages.length}件の保留メッセージを配信します`);

            // 少し待ってから配信（Claude起動を待つ）
            await this.delay(3000);

            // 保留メッセージをまとめて通知
            const summary = `【保留メッセージ ${messages.length}件】\n` + messages.join('\n');
            await this.sendMessageToAgent(agentId, summary);

            // 配信完了後、保留ファイルを削除
            fs.unlinkSync(pendingFile);
            this.log(`[${agentId}] 保留メッセージを配信し、キューをクリアしました`);
        } catch (error) {
            this.log(`[${agentId}] 保留メッセージ配信エラー: ${error}`);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =========================================================================
    // 階層構造の起動
    // =========================================================================

    /**
     * 既存のtmuxセッションからエージェントを復帰
     */
    async resumeSessions(): Promise<void> {
        if (!await this.ensureTmuxAvailable()) {
            return;
        }

        // tmuxManagerがない場合は初期化
        if (!this.tmuxManager) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('ワークスペースが開かれていません');
                return;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            const sessionName = getSessionNameFromPath(workspacePath);
            this.tmuxManager = new TmuxManager(sessionName, workspacePath);
        }

        // セッションが存在するかチェック
        if (!this.tmuxManager.sessionExists()) {
            vscode.window.showInformationMessage('復帰可能なセッションがありません。Call コマンドで新規に呼び出してください。');
            return;
        }

        // 既存のウィンドウを取得
        const windows = this.tmuxManager.listWindows();
        if (windows.length === 0) {
            vscode.window.showInformationMessage('復帰可能なエージェントがありません。');
            return;
        }

        // エージェント名とウィンドウ名のマッピング
        const agentMapping: { [key: string]: { name: string; role: 'butler' | 'chiefMaid' | 'maid'; emoji: string } } = {
            'butler': { name: 'シルヴィア', role: 'butler', emoji: '🎩' },
            'chief': { name: 'ビオラ', role: 'chiefMaid', emoji: '👑' },
            'emma': { name: 'エマ', role: 'maid', emoji: '🌸' },
            'sophia': { name: 'ソフィア', role: 'maid', emoji: '📚' },
            'lily': { name: 'リリー', role: 'maid', emoji: '🎨' },
            'rose': { name: 'ローズ', role: 'maid', emoji: '🌹' },
            'alice': { name: 'アリス', role: 'maid', emoji: '🔧' },
            'may': { name: 'メイ', role: 'maid', emoji: '🍰' },
            'flora': { name: 'フローラ', role: 'maid', emoji: '🌷' },
            'luna': { name: 'ルナ', role: 'maid', emoji: '🌙' }
        };

        let resumedCount = 0;
        const resumedNames: string[] = [];

        for (const windowName of windows) {
            // 既に登録済みならスキップ
            if (this.agents.has(windowName)) {
                continue;
            }

            const mapping = agentMapping[windowName];
            if (mapping) {
                // エージェントを登録（Claudeコマンドは送信しない）
                this.createAgent(mapping.name, windowName, mapping.role, mapping.emoji);
                // statusをidleに設定（既に稼働中の想定）
                const agent = this.agents.get(windowName);
                if (agent) {
                    agent.status = 'idle';
                }
                resumedCount++;
                resumedNames.push(`${mapping.emoji} ${mapping.name}`);
                this.log(`[復帰] ${mapping.name}（${windowName}）を復帰しました`);
            }
        }

        if (resumedCount > 0) {
            // maidAgentPathを設定
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                this.maidAgentPath = path.join(workspaceFolder.uri.fsPath, '.maid-agent');

                // 監視システムを開始（サイレントモード）
                this.startWatchingFiles(true);
            }

            // tmuxビューアを開く
            this.openTmuxViewer();

            vscode.window.showInformationMessage(`${resumedNames.join('、')} が復帰しました！`);
            this.updateDashboard();
            this.updateAgentPanel();
        } else {
            vscode.window.showInformationMessage('新たに復帰可能なエージェントはありませんでした。');
        }
    }

    /**
     * 既存セッションが存在するかチェックし、存在する場合は復帰を提案
     * @returns true: 続行OK, false: キャンセル
     */
    private async checkExistingSessionAndPrompt(agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'> {
        if (!this.tmuxManager) return 'new';

        // ウィンドウが既に存在するかチェック
        if (this.tmuxManager.windowExists(agentId)) {
            const choice = await vscode.window.showWarningMessage(
                `${agentName}のセッションが既に存在します。`,
                '復帰する', '新規起動（上書き）', 'キャンセル'
            );

            if (choice === '復帰する') {
                return 'resume';
            } else if (choice === '新規起動（上書き）') {
                // 既存ウィンドウを終了
                this.tmuxManager.killWindow(agentId);
                await this.delay(100);
                return 'new';
            } else {
                return 'cancel';
            }
        }

        return 'new';
    }

    async startButler(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        if (this.agents.has('butler')) {
            vscode.window.showWarningMessage('執事は既にお仕えしております');
            return;
        }

        // 既存セッションのチェック
        const action = await this.checkExistingSessionAndPrompt('butler', 'シルヴィア（執事）');
        if (action === 'cancel') return;

        this.createAgent('シルヴィア', 'butler', 'butler', '🎩');

        // tmuxビューアを開く
        this.openTmuxViewer();

        if (action === 'new') {
            // 新規起動: Claude Code を起動し、役割を認識させる
            await this.launchClaudeWithRole('butler', 'butler');
            vscode.window.showInformationMessage('🎩 シルヴィアがお仕えする準備ができました！');
        } else {
            // 復帰: Claudeコマンドは送信しない
            const agent = this.agents.get('butler');
            if (agent) agent.status = 'idle';
            vscode.window.showInformationMessage('🎩 シルヴィアが復帰しました！');
        }

        this.updateDashboard();
    }

    async startChiefMaid(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        if (this.agents.has('chief')) {
            vscode.window.showWarningMessage('メイド長は既にお仕えしております');
            return;
        }

        // 既存セッションのチェック
        const action = await this.checkExistingSessionAndPrompt('chief', 'ビオラ（メイド長）');
        if (action === 'cancel') return;

        this.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');

        // tmuxビューアを開く（まだ開いていなければ）
        this.openTmuxViewer();

        if (action === 'new') {
            // 新規起動: Claude Code を起動し、役割を認識させる
            await this.launchClaudeWithRole('chief', 'chiefMaid');
            vscode.window.showInformationMessage('👑 ビオラがお仕えする準備ができました！');
        } else {
            // 復帰: Claudeコマンドは送信しない
            const agent = this.agents.get('chief');
            if (agent) agent.status = 'idle';
            vscode.window.showInformationMessage('👑 ビオラが復帰しました！');
        }

        this.updateDashboard();
    }

    async startSelectedMaids(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        // 未起動のメイドのみ選択肢に（設定順）
        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
            return;
        }

        const items = availableMaids.map(m => ({
            label: `${m.emoji} ${m.name}`,
            id: m.id,
            picked: false
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: '起動するメイドを選択してください（複数選択可）'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        for (const item of selected) {
            const maid = MAIDS.find(m => m.id === item.id);
            if (maid) {
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                // Claude Code を起動し、役割を認識させる
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        }

        vscode.window.showInformationMessage(`🎀 メイド${selected.length}人がお仕えする準備ができました！`);
        this.updateDashboard();
    }

    /**
     * Call Maids xN - メイドN人を順番に起動
     */
    async startMaidsByCount(): Promise<void> {
        await this._startMaidsByCountInternal(false);
    }

    /**
     * Call Maids xN -r - メイドN人をランダムに起動
     */
    async startMaidsByCountRandom(): Promise<void> {
        await this._startMaidsByCountInternal(true);
    }

    private async _startMaidsByCountInternal(random: boolean): Promise<void> {
        if (!await this.ensureInitialized()) return;

        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
            return;
        }

        const countStr = await vscode.window.showInputBox({
            prompt: `何人のメイドをお呼びしますか？（1〜${availableMaids.length}人）${random ? '【ランダム】' : '【順番】'}`,
            placeHolder: '例: 3',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {
                    return '1以上の数値を入力してください';
                }
                if (num > availableMaids.length) {
                    return `最大${availableMaids.length}人まで指定できます`;
                }
                return null;
            }
        });

        if (!countStr) return;

        const count = parseInt(countStr);

        let maidsToStart: typeof availableMaids;
        if (random) {
            const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
            maidsToStart = shuffled.slice(0, count);
        } else {
            maidsToStart = availableMaids.slice(0, count);
        }

        // 進捗表示付きでお呼び出し
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🎀 メイドお仕えの準備中...',
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < maidsToStart.length; i++) {
                const maid = maidsToStart[i];
                progress.report({
                    message: `${maid.name}お仕えの準備中...`,
                    increment: (100 / maidsToStart.length)
                });
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        });

        const maidNames = maidsToStart.map(m => m.name).join('、');
        vscode.window.showInformationMessage(`🎀 ${maidNames} がお仕えの準備を整えました！`);
        this.updateDashboard();
    }

    /**
     * Call All xN - 執事 + メイド長 + メイドN人を順番に起動
     */
    async startAllByCount(): Promise<void> {
        await this._startAllByCountInternal(false);
    }

    /**
     * Call All xN -r - 執事 + メイド長 + メイドN人をランダムに起動
     */
    async startAllByCountRandom(): Promise<void> {
        await this._startAllByCountInternal(true);
    }

    private async _startAllByCountInternal(random: boolean): Promise<void> {
        if (!await this.ensureInitialized()) return;

        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております。Call All をお使いください。');
            return;
        }

        const countStr = await vscode.window.showInputBox({
            prompt: `メイドを何人お呼びしますか？（1〜${availableMaids.length}人）執事+メイド長もお呼び ${random ? '【ランダム】' : '【順番】'}`,
            placeHolder: '例: 3',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {
                    return '1以上の数値を入力してください';
                }
                if (num > availableMaids.length) {
                    return `最大${availableMaids.length}人まで指定できます`;
                }
                return null;
            }
        });

        if (!countStr) return;

        const count = parseInt(countStr);

        // 進捗表示付きでお呼び出し
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🎩 スタッフお仕えの準備中...',
            cancellable: false
        }, async (progress) => {
            const totalAgents = (this.agents.has('butler') ? 0 : 1) +
                               (this.agents.has('chief') ? 0 : 1) + count;
            let currentAgent = 0;

            // tmuxビューアを開く
            this.openTmuxViewer();

            // 執事・メイド長を先にお呼び
            if (!this.agents.has('butler')) {
                progress.report({ message: 'シルヴィア（執事）お仕えの準備中...', increment: 0 });
                this.createAgent('シルヴィア', 'butler', 'butler', '🎩');
                await this.launchClaudeWithRole('butler', 'butler');
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            if (!this.agents.has('chief')) {
                progress.report({ message: 'ビオラ（メイド長）お仕えの準備中...' });
                this.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');
                await this.launchClaudeWithRole('chief', 'chiefMaid');
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            let maidsToStart: typeof availableMaids;
            if (random) {
                const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
                maidsToStart = shuffled.slice(0, count);
            } else {
                maidsToStart = availableMaids.slice(0, count);
            }

            for (const maid of maidsToStart) {
                progress.report({ message: `${maid.name}（メイド）お仕えの準備中...` });
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            const maidNames = maidsToStart.map(m => m.name).join('、');
            vscode.window.showInformationMessage(`🎩 執事 + 👑 メイド長 + 🎀 ${maidNames} がお仕えの準備を整えました！`);
            this.updateDashboard();
        });
    }

    async startAllAgents(): Promise<void> {
        await this.startButler();
        await this.startChiefMaid();
        // 全メイドを設定順に起動
        const orderedMaids = getOrderedMaids();
        for (const maid of orderedMaids) {
            if (!this.agents.has(maid.id)) {
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        }
        this.updateDashboard();
    }

    private async ensureInitialized(): Promise<boolean> {
        // tmuxが利用可能かチェック
        if (!await this.ensureTmuxAvailable()) {
            return false;
        }

        if (!this.maidAgentPath || !fs.existsSync(this.maidAgentPath)) {
            const choice = await vscode.window.showWarningMessage(
                'Maid Agent が初期化されていません。初期化しますか？',
                '初期化する', 'キャンセル'
            );
            if (choice === '初期化する') {
                return await this.initializeWorkspace();
            }
            return false;
        }

        // MCPサーバーのヘルスチェック（Windows環境のみ）
        if (CURRENT_ENV === 'windows-native') {
            await this.ensureMcpServerRunning();
        }

        // セッション数の警告チェック
        await this.checkSessionCountWarning();

        return true;
    }

    /**
     * MCPサーバーが起動しているか確認し、起動していなければ起動する
     */
    private async ensureMcpServerRunning(): Promise<void> {
        const healthUrl = 'http://localhost:3100/health';

        try {
            // ヘルスチェック（タイムアウト3秒）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            try {
                const response = await fetch(healthUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    this.log('[MCP] サーバーは起動中');
                    return;
                }
            } catch {
                clearTimeout(timeoutId);
            }

            // サーバーが起動していない場合、起動を試みる
            this.log('[MCP] サーバーが応答しません。起動を試みます...');

            try {
                execSync(
                    `wsl bash -c "cd ~/.maid-agent/maid-agent-messenger && pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart maid-agent-messenger 2>/dev/null"`,
                    { encoding: 'utf-8', timeout: 10000 }
                );
                this.log('[MCP] サーバーを起動しました');

                // 起動待機（最大5秒）
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    try {
                        const checkController = new AbortController();
                        const checkTimeoutId = setTimeout(() => checkController.abort(), 2000);
                        const checkResponse = await fetch(healthUrl, { signal: checkController.signal });
                        clearTimeout(checkTimeoutId);
                        if (checkResponse.ok) {
                            this.log('[MCP] サーバー起動確認完了');
                            return;
                        }
                    } catch {
                        // 再試行
                    }
                }

                vscode.window.showWarningMessage(
                    'MCPサーバーの起動に時間がかかっています。エージェント間通信が不安定になる可能性があります。'
                );
            } catch (error) {
                this.log(`[MCP] サーバー起動失敗: ${error}`);
                vscode.window.showWarningMessage(
                    'MCPサーバーを起動できませんでした。Init Global を実行してセットアップしてください。'
                );
            }
        } catch (error) {
            this.log(`[MCP] ヘルスチェックエラー: ${error}`);
        }
    }

    /**
     * tmuxが利用可能かチェックし、なければインストールを提案
     */
    private async ensureTmuxAvailable(): Promise<boolean> {
        // Windows環境ではまずWSLをチェック
        if (CURRENT_ENV === 'windows-native') {
            if (!await this.ensureWslAvailable()) {
                return false;
            }
        }

        if (isTmuxAvailable()) {
            return true;
        }

        const envInfo = CURRENT_ENV === 'windows-native'
            ? 'Windows環境でWSL経由でtmuxを使用します。'
            : `現在の環境: ${CURRENT_ENV}`;

        const choice = await vscode.window.showErrorMessage(
            `tmuxがインストールされていません。\n${envInfo}\n\ntmuxをインストールしますか？`,
            'インストールする',
            'インストール方法を表示',
            'キャンセル'
        );

        if (choice === 'インストールする') {
            return await this.installTmux();
        } else if (choice === 'インストール方法を表示') {
            this.showTmuxInstallInstructions();
            return false;
        }

        return false;
    }

    /**
     * WSLが利用可能かチェックし、なければインストールを提案
     */
    private async ensureWslAvailable(): Promise<boolean> {
        if (isWslAvailable()) {
            return true;
        }

        const choice = await vscode.window.showErrorMessage(
            'WSL (Windows Subsystem for Linux) がインストールされていません。\n\n' +
            'この拡張機能はWSL上のtmuxを使用します。\n' +
            'WSLをインストールしますか？\n\n' +
            '※ 管理者権限のPowerShellが開きます',
            'インストールする',
            'インストール方法を表示',
            'キャンセル'
        );

        if (choice === 'インストールする') {
            return await this.installWsl();
        } else if (choice === 'インストール方法を表示') {
            this.showWslInstallInstructions();
            return false;
        }

        return false;
    }

    /**
     * WSLをインストール
     */
    private async installWsl(): Promise<boolean> {
        // PowerShellを管理者権限で開いてwsl --installを実行
        try {
            // 管理者権限でPowerShellを起動
            const terminal = vscode.window.createTerminal({
                name: '📦 WSL インストール',
                shellPath: 'powershell.exe'
            });
            terminal.show();
            terminal.sendText('Start-Process powershell -Verb RunAs -ArgumentList \'-Command\', \'wsl --install; Read-Host "インストールが完了したらEnterを押してください"\'');

            const result = await vscode.window.showInformationMessage(
                'WSLインストーラーを起動しました。\n\n' +
                '1. 管理者権限のPowerShellウィンドウが開きます\n' +
                '2. インストールが完了するまで待ちます\n' +
                '3. PCを再起動してください\n' +
                '4. 再起動後、再度このコマンドを実行してください\n\n' +
                'インストールが完了しましたか？',
                'PCを再起動する',
                '後で手動で行う'
            );

            if (result === 'PCを再起動する') {
                const confirmRestart = await vscode.window.showWarningMessage(
                    '本当にPCを再起動しますか？\n作業中のファイルを保存してください。',
                    '再起動',
                    'キャンセル'
                );
                if (confirmRestart === '再起動') {
                    execSync('shutdown /r /t 30 /c "WSLインストール完了のため再起動します"');
                    vscode.window.showInformationMessage('30秒後にPCが再起動します。');
                }
            }

            return false; // 再起動が必要なので一旦falseを返す
        } catch (error) {
            vscode.window.showErrorMessage(`WSLインストールの起動に失敗しました: ${error}`);
            return false;
        }
    }

    /**
     * WSLインストール方法を表示
     */
    private showWslInstallInstructions(): void {
        this.log('=== WSL インストール方法 ===');
        this.log('');
        this.log('【方法1: コマンドでインストール（推奨）】');
        this.log('1. PowerShellを管理者権限で開く');
        this.log('   - Windowsキーを押して「powershell」と入力');
        this.log('   - 「管理者として実行」を選択');
        this.log('');
        this.log('2. 以下のコマンドを実行:');
        this.log('   wsl --install');
        this.log('');
        this.log('3. PCを再起動');
        this.log('');
        this.log('4. 再起動後、WSLが自動的に起動しUbuntuのセットアップが始まります');
        this.log('   - ユーザー名とパスワードを設定してください');
        this.log('');
        this.log('【方法2: Windowsの機能から有効化】');
        this.log('1. 「Windowsの機能の有効化または無効化」を開く');
        this.log('2. 「Linux用Windowsサブシステム」にチェック');
        this.log('3. 「仮想マシンプラットフォーム」にチェック');
        this.log('4. PCを再起動');
        this.log('5. Microsoft StoreからUbuntuをインストール');
        this.log('');
        this.log('インストール後、再度Callコマンドを実行してください。');
        this.outputChannel.show();
    }

    /**
     * tmuxをインストール
     */
    private async installTmux(): Promise<boolean> {
        const terminal = vscode.window.createTerminal({
            name: '📦 tmux インストール',
            shellPath: CURRENT_ENV === 'windows-native' ? 'wsl.exe' : undefined
        });
        terminal.show();

        // インストールコマンドを送信
        const installCmd = 'sudo apt-get update && sudo apt-get install -y tmux';
        terminal.sendText(installCmd);

        // ユーザーにインストール完了を確認させる
        const result = await vscode.window.showInformationMessage(
            'tmuxのインストールを開始しました。\n' +
            'インストールが完了したら「完了」を押してください。\n' +
            '（sudoパスワードの入力が必要な場合があります）',
            '完了',
            'キャンセル'
        );

        if (result === '完了') {
            // インストールが成功したか確認
            if (isTmuxAvailable()) {
                const version = getTmuxVersion();
                vscode.window.showInformationMessage(`✅ tmuxのインストールが完了しました: ${version}`);
                return true;
            } else {
                vscode.window.showErrorMessage('tmuxのインストールに失敗したようです。手動でインストールしてください。');
                return false;
            }
        }

        return false;
    }

    /**
     * tmuxインストール方法を表示
     */
    private showTmuxInstallInstructions(): void {
        this.log('=== tmux インストール方法 ===');
        this.log('');

        if (CURRENT_ENV === 'windows-native') {
            this.log('【Windows + WSL環境】');
            this.log('1. WSLターミナルを開く');
            this.log('2. 以下のコマンドを実行:');
            this.log('   sudo apt-get update');
            this.log('   sudo apt-get install -y tmux');
            this.log('');
            this.log('※ WSLがインストールされていない場合:');
            this.log('   PowerShellを管理者権限で開き、以下を実行:');
            this.log('   wsl --install');
        } else if (CURRENT_ENV === 'macos') {
            this.log('【macOS環境】');
            this.log('Homebrewを使用:');
            this.log('   brew install tmux');
        } else {
            this.log('【Linux環境】');
            this.log('Ubuntu/Debian:');
            this.log('   sudo apt-get install tmux');
            this.log('');
            this.log('Fedora/RHEL:');
            this.log('   sudo dnf install tmux');
        }

        this.log('');
        this.log('インストール後、再度Callコマンドを実行してください。');
        this.outputChannel.show();
    }

    /**
     * maid-agentセッション数をチェックし、しきい値を超えていたら警告
     */
    private async checkSessionCountWarning(): Promise<void> {
        const config = vscode.workspace.getConfiguration('maidAgent');
        const threshold = config.get<number>('sessionWarningThreshold', 10);

        const { count, sessions } = TmuxManager.countMaidAgentSessions();

        if (count >= threshold) {
            const sessionList = sessions.slice(0, 5).join('\n  • ');
            const moreText = count > 5 ? `\n  ...他 ${count - 5} セッション` : '';

            const choice = await vscode.window.showWarningMessage(
                `⚠️ maid-agentセッションが ${count} 個存在します（しきい値: ${threshold}）\n` +
                `古いセッションのクリーンアップを検討してください。`,
                'セッション一覧を表示',
                '全てクリーンアップ',
                '続行'
            );

            if (choice === 'セッション一覧を表示') {
                // チェックボックス形式でセッション選択
                const items = sessions.map(sessionName => {
                    const isCurrent = sessionName === this.tmuxSessionName;
                    return {
                        label: isCurrent ? `$(star) ${sessionName}` : sessionName,
                        description: isCurrent ? '(現在のセッション)' : '',
                        sessionName: sessionName,
                        picked: false
                    };
                });

                const selected = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: '終了するセッションを選択してください（複数選択可）',
                    title: `maid-agent セッション一覧 (${count}個)`
                });

                if (selected && selected.length > 0) {
                    const confirmMsg = selected.some(s => s.sessionName === this.tmuxSessionName)
                        ? `${selected.length} 個のセッションを終了しますか？\n⚠️ 現在のセッションも含まれています！`
                        : `${selected.length} 個のセッションを終了しますか？`;

                    const confirm = await vscode.window.showWarningMessage(
                        confirmMsg,
                        '終了する',
                        'キャンセル'
                    );

                    if (confirm === '終了する') {
                        let killedCount = 0;
                        for (const item of selected) {
                            try {
                                const cmd = CURRENT_ENV === 'windows-native'
                                    ? `wsl tmux kill-session -t ${item.sessionName}`
                                    : `tmux kill-session -t ${item.sessionName}`;
                                execSync(cmd, { stdio: 'pipe' });
                                killedCount++;
                                this.log(`[クリーンアップ] セッション終了: ${item.sessionName}`);
                            } catch {
                                this.log(`[クリーンアップ] 終了失敗（既に終了済み?）: ${item.sessionName}`);
                            }
                        }
                        vscode.window.showInformationMessage(`${killedCount} 個のセッションを終了しました`);
                    }
                }
            } else if (choice === '全てクリーンアップ') {
                const confirm = await vscode.window.showWarningMessage(
                    `本当に ${count} 個の maid-agent セッションを全て終了しますか？\n` +
                    `（現在のセッションも含まれます）`,
                    '全て終了',
                    'キャンセル'
                );
                if (confirm === '全て終了') {
                    sessions.forEach(sessionName => {
                        try {
                            const cmd = CURRENT_ENV === 'windows-native'
                                ? `wsl tmux kill-session -t ${sessionName}`
                                : `tmux kill-session -t ${sessionName}`;
                            execSync(cmd, { stdio: 'pipe' });
                        } catch {
                            // 既に終了している場合は無視
                        }
                    });
                    vscode.window.showInformationMessage(`${count} 個のセッションをクリーンアップしました`);
                    this.log(`[クリーンアップ] ${count} 個のセッションを終了しました`);
                }
            }
            // '続行' または閉じた場合は何もせず続行
        }
    }

    // =========================================================================
    // タスク送信（YAMLキュー経由）
    // =========================================================================

    async sendTaskToButler(taskDescription: string): Promise<void> {
        const butler = this.agents.get('butler');
        if (!butler) {
            vscode.window.showWarningMessage('執事がおりません。先に起動してください。');
            return;
        }

        if (!this.maidAgentPath) return;

        this.log(`[タスク] ご主人様からの指令: ${taskDescription}`);

        // 執事にタスクを直接送信（2段階送信）
        // 執事がタスクを分解し、butler_to_chief.yaml に書き込む
        const instruction = `ご主人様からの指令です: ${taskDescription}\n\nこのタスクを分析し、必要に応じてサブタスクに分解して .maid-agent/system/data/queue/butler_to_chief.yaml に記載し、メイド長に通知してください。`;
        await this.sendMessageToAgent('butler', instruction);

        vscode.window.showInformationMessage('🎩 執事にタスクを送信しました');
        this.updateDashboard();
    }

    /**
     * 執事からメイド長への通知（butler.md の指示に従って実行される）
     * 執事のClaudeが内部的に使用するためのヘルパー
     */
    async notifyChief(message: string): Promise<void> {
        const chief = this.agents.get('chief');
        if (!chief) {
            this.log('[WARN] メイド長がおりません');
            return;
        }
        await this.sendMessageToAgent('chief', message);
    }

    /**
     * メイド長からメイドへの通知（chief.md の指示に従って実行される）
     * メイド長のClaudeが内部的に使用するためのヘルパー
     */
    async notifyMaid(maidId: string, message: string): Promise<void> {
        const maid = this.agents.get(maidId);
        if (!maid) {
            this.log(`[WARN] メイド ${maidId} がおりません`);
            return;
        }
        await this.sendMessageToAgent(maidId, message);
    }

    // =========================================================================
    // Claude Code 起動（手動用 - 通常は自動起動）
    // =========================================================================

    startClaudeOnAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // Claude Code を権限スキップモードで起動
        this.sendToAgent(agentId, 'claude --dangerously-skip-permissions');
    }

    async startClaudeOnAllAgents(): Promise<void> {
        let count = 0;
        for (const [id, agent] of this.agents) {
            this.sendToAgent(id, 'claude --dangerously-skip-permissions');
            await this.delay(500); // 各エージェント間で少し待つ
            count++;
        }

        if (count > 0) {
            vscode.window.showInformationMessage(`🤖 ${count}人のエージェントがClaude Codeを起動しました`);
        }
    }

    // =========================================================================
    // ステータス管理
    // =========================================================================

    /**
     * master_status.yaml を更新
     * エージェントのステータスと最終アクティブ時刻を記録
     */
    private updateMasterStatus(agentId: string, status: 'offline' | 'idle' | 'working' | 'done'): void {
        if (!this.maidAgentPath) return;

        const statusPath = path.join(this.maidAgentPath, 'status', 'master_status.yaml');
        if (!fs.existsSync(statusPath)) return;

        try {
            let content = fs.readFileSync(statusPath, 'utf-8');
            const timestamp = new Date().toISOString();

            // last_updated を更新
            content = content.replace(/last_updated: .*/, `last_updated: "${timestamp}"`);

            // session_start を設定（未設定の場合）
            if (content.includes('session_start: null')) {
                content = content.replace(/session_start: null/, `session_start: "${timestamp}"`);
            }

            // initialized_at を設定（未設定の場合）
            if (content.includes('initialized_at: null')) {
                content = content.replace(/initialized_at: null/, `initialized_at: "${timestamp}"`);
            }

            // エージェントのステータスを更新
            // butler, chief の場合
            if (agentId === 'butler' || agentId === 'chief') {
                const agentSection = new RegExp(
                    `(${agentId}:\\s*\\n\\s*status: )\\w+`,
                    'g'
                );
                content = content.replace(agentSection, `$1${status}`);

                const lastActiveSection = new RegExp(
                    `(${agentId}:[\\s\\S]*?last_active: ).*`,
                    ''
                );
                content = content.replace(lastActiveSection, `$1"${timestamp}"`);
            } else {
                // メイドの場合（maids セクション内）
                const maidSection = new RegExp(
                    `(${agentId}:\\s*\\n\\s*status: )\\w+`,
                    'g'
                );
                content = content.replace(maidSection, `$1${status}`);

                const lastActiveSection = new RegExp(
                    `(${agentId}:[\\s\\S]*?last_active: ).*`,
                    ''
                );
                content = content.replace(lastActiveSection, `$1"${timestamp}"`);
            }

            fs.writeFileSync(statusPath, content);
            this.log(`[ステータス] ${agentId}: ${status}`);
        } catch (error) {
            this.log(`[WARN] ステータス更新に失敗: ${error}`);
        }
    }

    // =========================================================================
    // ファイル監視
    // =========================================================================

    startWatchingFiles(silent: boolean = false): void {
        if (!this.maidAgentPath) return;

        // 既に監視中なら何もしない
        if (this.fileWatcher) {
            if (!silent) {
                vscode.window.showInformationMessage('📁 ファイル監視・通知システムは既に動作中です');
            }
            return;
        }

        // dashboard.md を監視
        const pattern = new vscode.RelativePattern(
            this.maidAgentPath,
            '{dashboard.md,queue/*.yaml,reports/*.md}'
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange((uri) => {
            const fileName = path.basename(uri.fsPath);
            this.log(`[ファイル変更] ${fileName}`);
            this.updateDashboard();

            // dashboard.md が更新されたらユーザーに通知 + プレビュー更新
            if (fileName === 'dashboard.md') {
                this.notifyDashboardUpdate(uri.fsPath);
                this.updateDashboardMarkdownPanel();
            }

            // reports/*.md が更新されたらメイド長への報告チェック
            if (uri.fsPath.includes('/reports/') && fileName.endsWith('.md') && fileName !== '.gitkeep') {
                const maidName = fileName.replace('.md', '');
                this.checkMaidReportToChief(maidName);
            }
        });

        this.context?.subscriptions.push(this.fileWatcher);
        this.log('[ファイル監視] 開始');

        // 注: エージェント間通知は直接 tmux send-keys で行われるため、
        // pending.json の監視は不要になりました

        if (!silent) {
            vscode.window.showInformationMessage('📁 ファイル監視を開始しました');
        }
    }

    /**
     * dashboard.md 更新時にユーザーに通知
     */
    private async notifyDashboardUpdate(dashboardPath: string): Promise<void> {
        try {
            const content = fs.readFileSync(dashboardPath, 'utf-8');

            // 完了タスクがあるかチェック
            const hasCompleted = content.includes('✅ 本日の成果') &&
                                 content.match(/\| \d{2}:\d{2} \|/); // 時刻パターンがあれば完了あり

            // 要対応事項があるかチェック（セクション内の内容のみ確認）
            let hasIssues = false;
            if (content.includes('🚨 要対応')) {
                // 🚨 要対応 と次の ## セクションの間の内容を抽出
                const afterYoutaiou = content.split('🚨 要対応')[1];
                if (afterYoutaiou) {
                    // 次の ## までの内容を取得
                    const sectionContent = afterYoutaiou.split(/\n## /)[0].trim();
                    // プレースホルダーテキストでなければ要対応ありと判断
                    const placeholders = [
                        'ご主人様のご判断が必要な事項はございません',
                        '（なし）',
                        'なし',
                        ''
                    ];
                    hasIssues = !placeholders.some(p => sectionContent === p || sectionContent.endsWith(p));
                }
            }

            // 進行中タスクがあるかチェック
            const hasInProgress = content.includes('⚡ 進行中') &&
                                  content.includes('- [ ]');

            let message: string;
            let icon: string;

            if (hasIssues) {
                icon = '🚨';
                message = '要対応事項があります';
            } else if (hasCompleted) {
                icon = '✅';
                message = 'タスクが完了しました';
            } else if (hasInProgress) {
                icon = '⚡';
                message = 'タスクが進行中です';
            } else {
                // 大きな変更がなければ通知しない
                return;
            }

            // 🚨 要対応のみモーダルダイアログ、それ以外はステータスバー通知（ターミナル入力を中断しない）
            // 注: プレビュー自動リフレッシュは削除（フォーカスが奪われるため）
            //     ユーザーはステータスバーをクリックしてダッシュボードを開ける
            if (hasIssues) {
                const choice = await vscode.window.showWarningMessage(
                    `${icon} Dashboard更新: ${message}`,
                    'Dashboardを開く',
                    '執事に確認を依頼'
                );

                if (choice === 'Dashboardを開く') {
                    // マークダウンプレビューで開く
                    const uri = vscode.Uri.file(dashboardPath);
                    await vscode.commands.executeCommand('markdown.showPreview', uri);
                } else if (choice === '執事に確認を依頼') {
                    const butler = this.agents.get('butler');
                    if (butler) {
                        await this.sendMessageToAgent('butler', 'dashboard.md を確認して、現在の状況を報告してください。');
                        vscode.window.showInformationMessage('🎩 執事に確認を依頼しました');
                    } else {
                        vscode.window.showWarningMessage('執事がまだ起動していません');
                    }
                }
            } else {
                // 非クリティカルな更新はステータスバーに表示（入力を中断しない）
                this.showStatusBarNotification(icon, message);
                this.log(`[Dashboard] ${icon} ${message}`);
            }
        } catch (error) {
            this.log(`[Dashboard通知] エラー: ${error}`);
        }
    }

    // 報告チェック用のタイマーを管理
    private pendingReportChecks: Map<string, NodeJS.Timeout> = new Map();

    /**
     * メイドがメイド長に報告したかチェック
     * reports/*.md 更新後、5秒以内にchief宛の通知がなければリマインド
     */
    private checkMaidReportToChief(maidName: string): void {
        // 既存のタイマーがあればクリア（連続更新対応）
        const existingTimer = this.pendingReportChecks.get(maidName);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        this.log(`[報告チェック] ${maidName} のレポート更新を検知、5秒後にチェック`);

        // 5秒後にチェック
        const timer = setTimeout(async () => {
            this.pendingReportChecks.delete(maidName);

            // 通知履歴ログを確認
            if (!this.maidAgentPath) return;

            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
            let hasNotifiedChief = false;

            try {
                if (fs.existsSync(historyPath)) {
                    const content = fs.readFileSync(historyPath, 'utf-8');
                    const lines = content.trim().split('\n');

                    // 直近30秒以内にこのメイドからchiefへの通知があるかチェック
                    // ログ形式: [2025-01-29 12:34:56] sender → target: message
                    const now = Date.now();
                    const thirtySecondsAgo = now - 30000;

                    const pattern = new RegExp(`^\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] ${maidName} → chief:`);

                    for (const line of lines.reverse()) {  // 新しいものから確認
                        const match = line.match(pattern);
                        if (match) {
                            const notifyTime = new Date(match[1]).getTime();
                            if (notifyTime > thirtySecondsAgo) {
                                hasNotifiedChief = true;
                                break;
                            }
                            // 30秒より古い通知なら、それ以前は確認不要
                            break;
                        }
                    }
                }
            } catch {
                // パースエラーなどは無視
            }

            if (!hasNotifiedChief) {
                // メイドがアクティブかチェック
                const maid = this.agents.get(maidName);
                if (maid) {
                    this.log(`[報告チェック] ${maidName} がメイド長への報告を忘れている可能性`);

                    // リマインドを送信
                    const reminder = `レポートを更新したようですが、メイド長への報告はお済みですか？\n完了した場合は .maid-agent/system/bin/maid-notify chief "タスク完了の報告" を実行してください。`;
                    await this.sendMessageToAgent(maidName, reminder);

                    this.log(`[報告チェック] ${maidName} にリマインドを送信しました`);
                }
            } else {
                this.log(`[報告チェック] ${maidName} は正常にメイド長へ報告済み`);
            }
        }, 5000);

        this.pendingReportChecks.set(maidName, timer);
    }

    stopWatchingFiles(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        this.log('[ファイル監視] 停止');
        vscode.window.showInformationMessage('📁 ファイル監視・通知システムを停止しました');
    }

    // =========================================================================
    // 通知システム（エージェント間通信）
    // =========================================================================

    // =========================================================================
    // 通知ログ（直接send-keys方式への移行により、pending.json処理は廃止）
    // 通知履歴は .maid-agent/system/data/notifications/history.log に記録される
    // =========================================================================

    /**
     * 通知履歴を表示（デバッグ用）
     * 直接send-keys方式では、通知履歴は history.log に記録される
     */
    async manualProcessNotifications(): Promise<void> {
        this.log('[デバッグ] 通知履歴を表示');

        if (!this.maidAgentPath) {
            vscode.window.showErrorMessage('maidAgentPath が設定されていません');
            return;
        }

        const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
        if (!fs.existsSync(historyPath)) {
            vscode.window.showWarningMessage('history.log が存在しません（まだ通知が送信されていません）');
            return;
        }

        try {
            const content = fs.readFileSync(historyPath, 'utf-8');
            const lines = content.trim().split('\n');
            const recentLines = lines.slice(-20);  // 最新20件を表示

            this.log(`[通知履歴] 最新${recentLines.length}件:`);
            recentLines.forEach(line => {
                this.log(`  ${line}`);
            });

            this.outputChannel.show();
            vscode.window.showInformationMessage(`通知履歴: ${lines.length}件（最新20件を出力パネルに表示）`);
        } catch (error) {
            vscode.window.showErrorMessage(`エラー: ${error}`);
        }
    }

    /**
     * 現在の状態を表示（デバッグ用）
     */
    showDebugStatus(): void {
        const agentList = Array.from(this.agents.entries()).map(([id, agent]) => {
            return `  - ${id}: ${agent.name} (${agent.role}, ${agent.status})`;
        }).join('\n');

        // 通知履歴の件数を取得
        let notifyCount = 0;
        if (this.maidAgentPath) {
            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
            if (fs.existsSync(historyPath)) {
                try {
                    const content = fs.readFileSync(historyPath, 'utf-8');
                    notifyCount = content.trim().split('\n').filter(l => l.length > 0).length;
                } catch { /* ignore */ }
            }
        }

        const status = `
=== Maid Agent デバッグ情報 ===
maidAgentPath: ${this.maidAgentPath || '未設定'}
tmuxManager: ${this.tmuxManager ? '初期化済み' : '未初期化'}
tmuxSessionName: ${this.tmuxSessionName || '未設定'}
通知方式: 直接send-keys（pending.json廃止）
通知履歴: ${notifyCount}件
fileWatcher: ${this.fileWatcher ? '稼働中' : '停止'}

登録済みエージェント (${this.agents.size}):
${agentList || '  (なし)'}
`;
        this.log(status);

        // ポップアップでも表示
        vscode.window.showInformationMessage(
            `エージェント数: ${this.agents.size}, 通知履歴: ${notifyCount}件`,
            '出力パネルを開く'
        ).then(choice => {
            if (choice === '出力パネルを開く') {
                this.outputChannel.show();
            }
        });
    }

    // =========================================================================
    // ダッシュボード
    // =========================================================================

    showDashboard(): void {
        if (this.dashboardPanel) {
            this.dashboardPanel.reveal();
            this.updateDashboard();
            return;
        }

        this.dashboardPanel = vscode.window.createWebviewPanel(
            'multiAgentDashboard',
            '🎩 Maid Agent Dashboard',
            vscode.ViewColumn.Active,
            { enableScripts: true }
        );

        this.dashboardPanel.onDidDispose(() => {
            this.dashboardPanel = undefined;
        });

        this.dashboardPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateDashboard();
                        break;
                    case 'sendTask':
                        this.promptAndSendToButler();
                        break;
                    case 'openFile':
                        this.openMaidAgentFile(message.file);
                        break;
                    case 'showDashboardPanel':
                        this.showDashboardMarkdownPanel();
                        break;
                    case 'showTaskDashboard':
                        this.showWebDashboard();
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateDashboard();
    }

    // =========================================================================
    // Webダッシュボード（MCPサーバー版）
    // =========================================================================

    private webDashboardPanel: vscode.WebviewPanel | undefined;

    showWebDashboard(): void {
        if (this.webDashboardPanel) {
            this.webDashboardPanel.reveal();
            this.updateWebDashboard();
            return;
        }

        this.webDashboardPanel = vscode.window.createWebviewPanel(
            'maidAgentWebDashboard',
            '📋 Dashboard',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.webDashboardPanel.onDidDispose(() => {
            this.webDashboardPanel = undefined;
        });

        this.webDashboardPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateWebDashboard();
                        break;
                    case 'openInBrowser':
                        this.openDashboardInBrowser();
                        break;
                    case 'showController':
                        this.showDashboard();
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateWebDashboard();
    }

    private async updateWebDashboard(): Promise<void> {
        if (!this.webDashboardPanel) return;

        // workspaceRootがない場合は再取得を試みる
        let projectPath = this.workspaceRoot;
        if (!projectPath) {
            projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        }

        if (!projectPath) {
            // ワークスペースが開かれていない場合のエラー表示
            this.webDashboardPanel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, sans-serif;
                            background: #1e1e1e;
                            color: #cccccc;
                            padding: 40px;
                            text-align: center;
                        }
                        .error-icon { font-size: 4rem; margin-bottom: 20px; }
                        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
                        .error-message { color: #808080; }
                    </style>
                </head>
                <body>
                    <div class="error-icon">📁</div>
                    <div class="error-title">ワークスペースが開かれていません</div>
                    <div class="error-message">フォルダを開いてから再度お試しください</div>
                </body>
                </html>
            `;
            return;
        }

        try {
            // MCPサーバーからHTMLを取得
            const serverUrl = 'http://localhost:3100';
            // Windows環境の場合はWSLパスに変換
            const normalizedPath = CURRENT_ENV === 'windows-native'
                ? windowsToWslPath(projectPath)
                : projectPath;
            const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(normalizedPath)}`;

            const response = await fetch(dashboardUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let html = await response.text();

            // VSCode Webview用に修正
            // 1. 自動リロードを無効化（Webviewで手動更新）
            html = html.replace(/<meta http-equiv="refresh"[^>]*>/gi, '');
            html = html.replace(/setTimeout\(\(\) => location\.reload\(\)[^)]*\);?/g, '');

            // 2. Webview用のスクリプトを追加
            const webviewScript = `
                <script>
                    const vscode = acquireVsCodeApi();
                    function refreshDashboard() { vscode.postMessage({ command: 'refresh' }); }
                    function openInBrowser() { vscode.postMessage({ command: 'openInBrowser' }); }
                    function showController() { vscode.postMessage({ command: 'showController' }); }
                </script>
                <style>
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .header-right {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    .vscode-controls {
                        display: flex;
                        gap: 8px;
                    }
                    .vscode-btn {
                        background: var(--accent-color, #569cd6);
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.85rem;
                    }
                    .vscode-btn:hover {
                        opacity: 0.9;
                    }
                </style>
            `;

            // 3. ヘッダー内にコントロールボタンを配置
            // 元の <div class="timestamp">...</div> を header-right で囲んでボタンを追加
            html = html.replace(
                /<div class="timestamp">([^<]*)<\/div>/,
                `<div class="header-right">
                    <div class="vscode-controls">
                        <button class="vscode-btn" onclick="showController()">⚙️ Controller</button>
                        <button class="vscode-btn" onclick="refreshDashboard()">🔄 更新</button>
                        <button class="vscode-btn" onclick="openInBrowser()">🌐 ブラウザ</button>
                    </div>
                    <div class="timestamp">$1</div>
                </div>`
            );

            // HTMLに挿入
            html = html.replace('</head>', `${webviewScript}</head>`);

            this.webDashboardPanel.webview.html = html;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.webDashboardPanel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, sans-serif;
                            background: #1e1e1e;
                            color: #cccccc;
                            padding: 40px;
                            text-align: center;
                        }
                        .error-icon { font-size: 4rem; margin-bottom: 20px; }
                        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
                        .error-message { color: #808080; margin-bottom: 20px; }
                        .btn {
                            background: #569cd6;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 1rem;
                        }
                        .hint { margin-top: 30px; font-size: 0.9rem; color: #808080; }
                        code { background: #333; padding: 2px 6px; border-radius: 3px; }
                    </style>
                </head>
                <body>
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">MCPサーバーに接続できません</div>
                    <div class="error-message">${message}</div>
                    <button class="btn" onclick="location.reload()">🔄 再試行</button>
                    <div class="hint">
                        <p>MCPサーバーが起動していることを確認してください:</p>
                        <code>pm2 status maid-agent-messenger</code>
                    </div>
                </body>
                </html>
            `;
        }
    }

    /**
     * ブラウザでWebダッシュボードを開く
     */
    public openDashboardInBrowser(): void {
        if (!this.workspaceRoot) return;
        const serverUrl = 'http://localhost:3100';
        // Windows環境の場合はWSLパスに変換
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(this.workspaceRoot)
            : this.workspaceRoot;
        const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(normalizedPath)}`;
        vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    }

    private async openMaidAgentFile(filename: string): Promise<void> {
        if (!this.maidAgentPath) return;
        const filePath = path.join(this.maidAgentPath, filename);
        if (fs.existsSync(filePath)) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            // Markdownファイルの場合はプレビューも表示
            if (filename.endsWith('.md')) {
                await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filePath));
            }
        }
    }

    private dashboardMarkdownPanel: vscode.WebviewPanel | undefined;

    /**
     * dashboard.md を専用のWebviewパネルでレンダリング表示
     * （VSCodeのMarkdownプレビュータブを占有しない）
     */
    private showDashboardMarkdownPanel(): void {
        if (!this.maidAgentPath) {
            vscode.window.showWarningMessage('ワークスペースが初期化されていません');
            return;
        }

        const dashboardPath = path.join(this.maidAgentPath, 'dashboard.md');
        if (!fs.existsSync(dashboardPath)) {
            vscode.window.showWarningMessage('dashboard.md が見つかりません');
            return;
        }

        // 既存パネルがあれば更新して表示
        if (this.dashboardMarkdownPanel) {
            this.updateDashboardMarkdownPanel();
            this.dashboardMarkdownPanel.reveal(vscode.ViewColumn.Active);
            return;
        }

        // 新規パネルを作成
        this.dashboardMarkdownPanel = vscode.window.createWebviewPanel(
            'dashboardMarkdown',
            '📊 Dashboard.md',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true  // 非表示時も状態を保持
            }
        );
        this.setupDashboardPanelHandlers(this.dashboardMarkdownPanel);
        this.updateDashboardMarkdownPanel();
    }

    private dashboardFileWatcher: vscode.FileSystemWatcher | undefined;

    /**
     * ダッシュボードパネルのイベントハンドラーをセットアップ
     * （新規作成時とSerializer復元時の両方で使用）
     */
    private setupDashboardPanelHandlers(panel: vscode.WebviewPanel): void {
        // ファイル変更監視を開始
        this.startDashboardFileWatcher();

        panel.onDidDispose(() => {
            this.dashboardMarkdownPanel = undefined;
            // パネルが閉じられたらファイル監視を停止
            this.stopDashboardFileWatcher();
        });

        // 更新ボタン用のメッセージハンドラ
        panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'refresh') {
                    this.updateDashboardMarkdownPanel();
                } else if (message.command === 'edit') {
                    this.openMaidAgentFile('dashboard.md');
                }
            },
            undefined,
            this.context?.subscriptions
        );
    }

    /**
     * dashboard.md のファイル変更監視を開始
     */
    private startDashboardFileWatcher(): void {
        if (this.dashboardFileWatcher || !this.maidAgentPath) return;

        const dashboardPath = path.join(this.maidAgentPath, 'dashboard.md');
        const pattern = new vscode.RelativePattern(
            vscode.Uri.file(this.maidAgentPath),
            'dashboard.md'
        );

        this.dashboardFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // ファイル変更時に自動更新
        this.dashboardFileWatcher.onDidChange(() => {
            this.updateDashboardMarkdownPanel();
        });

        // ファイル作成時も更新
        this.dashboardFileWatcher.onDidCreate(() => {
            this.updateDashboardMarkdownPanel();
        });
    }

    /**
     * dashboard.md のファイル変更監視を停止
     */
    private stopDashboardFileWatcher(): void {
        if (this.dashboardFileWatcher) {
            this.dashboardFileWatcher.dispose();
            this.dashboardFileWatcher = undefined;
        }
    }

    /**
     * Serializerからパネルを復元する
     */
    restoreDashboardPanel(panel: vscode.WebviewPanel): void {
        this.dashboardMarkdownPanel = panel;
        this.setupDashboardPanelHandlers(panel);
        this.updateDashboardMarkdownPanel();
    }

    /**
     * dashboard.md 専用パネルの内容を更新
     */
    private updateDashboardMarkdownPanel(): void {
        if (!this.dashboardMarkdownPanel || !this.maidAgentPath) return;

        const dashboardPath = path.join(this.maidAgentPath, 'dashboard.md');
        let contentHtml = '<p>dashboard.md が見つかりません</p>';

        if (fs.existsSync(dashboardPath)) {
            const rawContent = fs.readFileSync(dashboardPath, 'utf-8');
            contentHtml = simpleMarkdownToHtml(rawContent);
        }

        this.dashboardMarkdownPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
            line-height: 1.6;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e94560;
        }
        h1 { color: #e94560; margin: 0; font-size: 1.4em; }
        .actions { display: flex; gap: 10px; }
        .btn {
            background: rgba(255,255,255,0.1);
            color: white;
            border: 1px solid rgba(255,255,255,0.2);
            padding: 6px 12px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.85em;
        }
        .btn:hover { background: rgba(255,255,255,0.2); }
        .btn.primary { background: #e94560; border-color: #e94560; }
        .btn.primary:hover { background: #d63050; }
        .content {
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 20px;
        }
        /* Markdown スタイル */
        .md-h1 { font-size: 1.5em; color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 8px; margin: 20px 0 15px 0; }
        .md-h2 { font-size: 1.25em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 5px; margin: 18px 0 12px 0; }
        .md-h3 { font-size: 1.1em; color: #81c784; margin: 15px 0 8px 0; }
        .md-p { margin: 10px 0; }
        .md-ul { margin: 8px 0; padding-left: 25px; }
        .md-li { margin: 5px 0; list-style-type: disc; }
        .md-checkbox { padding: 5px 0; }
        .md-checkbox.checked { color: #81c784; }
        .md-table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        .md-table th, .md-table td { border: 1px solid #444; padding: 8px 12px; text-align: left; }
        .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
        .md-code-block { background: #0a0a0a; padding: 15px; border-radius: 8px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 10px 0; }
        .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
        .md-hr { border: none; border-top: 1px solid #444; margin: 20px 0; }
        .md-link { color: #4fc3f7; }
        strong { color: #ffc107; }
        em { font-style: italic; color: #aaa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Dashboard.md</h1>
        <div class="actions">
            <button class="btn" onclick="refresh()">🔄 更新</button>
            <button class="btn primary" onclick="edit()">✏️ 編集</button>
        </div>
    </div>
    <div class="content">
        ${contentHtml}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function edit() { vscode.postMessage({ command: 'edit' }); }
    </script>
</body>
</html>`;
    }

    private updateDashboard(): void {
        if (!this.dashboardPanel) return;

        const butler = this.agents.get('butler');
        const chief = this.agents.get('chief');
        const maids = MAIDS.map(m => this.agents.get(m.id)).filter(Boolean) as Agent[];

        // dashboard.md の内容を読み込んでHTMLに変換
        let dashboardContentHtml = '';
        if (this.maidAgentPath) {
            const dashboardPath = path.join(this.maidAgentPath, 'dashboard.md');
            if (fs.existsSync(dashboardPath)) {
                const rawContent = fs.readFileSync(dashboardPath, 'utf-8');
                dashboardContentHtml = simpleMarkdownToHtml(rawContent);
            }
        }

        // 会話ログ（history.log）を読み込む
        let conversationLogs = '';
        if (this.maidAgentPath) {
            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
            if (fs.existsSync(historyPath)) {
                const content = fs.readFileSync(historyPath, 'utf-8');
                const lines = content.trim().split('\n').filter(l => l.length > 0);
                // 最新20件を逆順で表示
                conversationLogs = lines.slice(-20).reverse().map(line => {
                    // [2024-01-01 12:34:56] sender → target: message の形式をパース
                    const match = line.match(/^\[([^\]]+)\] (\w+) → (\w+): (.+)$/);
                    if (match) {
                        const [, timestamp, sender, target, message] = match;
                        return `<div class="conv-entry"><span class="conv-time">${timestamp.split(' ')[1]}</span> <span class="conv-sender">${sender}</span> → <span class="conv-target">${target}</span>: ${message}</div>`;
                    }
                    return `<div class="conv-entry">${line}</div>`;
                }).join('');
            }
        }

        const renderAgent = (a: Agent, emoji: string, role: string) => {
            const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
            const statusClass = a.status === 'working' ? 'working' : 'idle';
            return `
                <div class="agent-card ${statusClass}">
                    <div class="agent-header">
                        <span class="agent-name">${emoji} ${a.name}</span>
                        <span class="agent-role">${role}</span>
                    </div>
                    <div class="agent-status">
                        <span class="status-badge">${statusEmoji} ${a.status}</span>
                    </div>
                </div>`;
        };

        const butlerHtml = butler ? renderAgent(butler, '🎩', '統括') : '<div class="empty-agent">執事がおりません</div>';
        const chiefHtml = chief ? renderAgent(chief, '👑', '配分担当') : '<div class="empty-agent">メイド長がおりません</div>';
        const maidsHtml = maids.length > 0
            ? maids.map(m => renderAgent(m, '🎀', '実行担当')).join('')
            : '<div class="empty-agent">メイドがおりません</div>';

        const recentLogs = this.logs.slice(-10).reverse().map(log =>
            `<div class="log-entry">${log}</div>`
        ).join('');

        this.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
        }
        h1 { color: #e94560; margin-bottom: 5px; }
        h2 { color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 5px; margin-top: 0; font-size: 1.1em; }
        .subtitle { color: #888; margin-bottom: 20px; }

        .action-bar { display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; }
        .action-btn {
            background: #e94560; color: white; border: none;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85em;
        }
        .action-btn:hover { background: #d63050; }
        .action-btn.secondary { background: rgba(255,255,255,0.2); }

        .hierarchy { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 20px 0; }
        .hierarchy-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .hierarchy-arrow { color: #e94560; font-size: 1.2em; }

        .agent-card {
            background: rgba(255,255,255,0.1); border-radius: 8px;
            padding: 10px; min-width: 120px; border: 1px solid rgba(255,255,255,0.2);
            font-size: 0.9em;
        }
        .agent-card.working { border-color: #ffc107; background: rgba(255,193,7,0.1); }
        .agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .agent-name { font-weight: bold; }
        .agent-role { font-size: 0.7em; color: #888; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 5px; }
        .status-badge { font-size: 0.75em; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.15); }
        .empty-agent { color: #666; font-style: italic; padding: 15px; }

        .section { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; margin: 15px 0; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

        .file-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .file-link {
            background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 5px;
            cursor: pointer; font-size: 0.8em;
        }
        .file-link:hover { background: rgba(255,255,255,0.2); }

        .dashboard-content {
            background: #0a0a0a; border-radius: 8px; padding: 15px;
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif; font-size: 0.85em;
            max-height: 400px; overflow-y: auto; line-height: 1.5;
        }
        /* Markdown スタイル */
        .dashboard-content .md-h1 { font-size: 1.3em; color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 5px; margin: 15px 0 10px 0; }
        .dashboard-content .md-h2 { font-size: 1.1em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 3px; margin: 12px 0 8px 0; }
        .dashboard-content .md-h3 { font-size: 1em; color: #81c784; margin: 10px 0 5px 0; }
        .dashboard-content .md-p { margin: 8px 0; }
        .dashboard-content .md-ul { margin: 5px 0; padding-left: 20px; }
        .dashboard-content .md-li { margin: 3px 0; list-style-type: disc; }
        .dashboard-content .md-checkbox { padding: 3px 0; }
        .dashboard-content .md-checkbox.checked { color: #81c784; }
        .dashboard-content .md-table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 0.9em; }
        .dashboard-content .md-table th, .dashboard-content .md-table td { border: 1px solid #444; padding: 5px 8px; text-align: left; }
        .dashboard-content .md-table th { background: rgba(255,255,255,0.1); }
        .dashboard-content .md-code-block { background: #1a1a1a; padding: 10px; border-radius: 5px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; }
        .dashboard-content .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 3px; font-family: 'Consolas', monospace; }
        .dashboard-content .md-hr { border: none; border-top: 1px solid #444; margin: 15px 0; }
        .dashboard-content .md-link { color: #4fc3f7; }
        .dashboard-content strong { color: #ffc107; }
        .dashboard-content em { font-style: italic; color: #aaa; }

        .log-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #0f0; padding: 2px 5px; border-bottom: 1px solid #222;
        }

        .conv-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .conv-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #ddd; padding: 4px 5px; border-bottom: 1px solid #222;
        }
        .conv-time { color: #666; }
        .conv-sender { color: #4fc3f7; font-weight: bold; }
        .conv-target { color: #81c784; font-weight: bold; }

        .three-column { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
        @media (max-width: 900px) { .three-column { grid-template-columns: 1fr; } }

        @media (max-width: 600px) { .two-column { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <h1>🎩 Maid Agent Controller</h1>
    <p class="subtitle">執事 → メイド長 → メイド の階層構造（multi-agent-shogun準拠）</p>

    <div class="action-bar">
        <button class="action-btn" onclick="sendTask()">📝 執事に指令</button>
        <button class="action-btn secondary" onclick="refresh()">🔄 更新</button>
        <button class="action-btn secondary" onclick="showTaskDashboard()">📋 Tasks</button>
        <button class="action-btn secondary" onclick="showDashboardPanel()">📊 dashboard.md</button>
        <button class="action-btn secondary" onclick="openFile('queue/butler_to_chief.yaml')">📂 Queue</button>
    </div>

    <div class="three-column">
        <div class="section">
            <h2>📊 Dashboard.md</h2>
            <div class="dashboard-content">${dashboardContentHtml || '<p class="md-p">(未読み込み)</p>'}</div>
        </div>
        <div class="section">
            <h2>💬 会話ログ</h2>
            <div class="conv-container">
                ${conversationLogs || '<div class="conv-entry">会話ログはございません</div>'}
            </div>
        </div>
        <div class="section">
            <h2>📜 システムログ</h2>
            <div class="log-container">
                ${recentLogs || '<div class="log-entry">ログはございません</div>'}
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📊 階層構造</h2>
        <div class="hierarchy">
            <div class="hierarchy-row">${butlerHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${chiefHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${maidsHtml}</div>
        </div>
    </div>

    <div class="section">
        <h2>📁 設定ファイル</h2>
        <div class="file-links">
            <span class="file-link" onclick="openFile('CLAUDE.md')">CLAUDE.md</span>
            <span class="file-link" onclick="openFile('instructions/butler.md')">butler.md</span>
            <span class="file-link" onclick="openFile('instructions/chief.md')">chief.md</span>
            <span class="file-link" onclick="openFile('instructions/maid.md')">maid.md</span>
            <span class="file-link" onclick="openFile('config/settings.yaml')">settings.yaml</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function sendTask() { vscode.postMessage({ command: 'sendTask' }); }
        function openFile(file) { vscode.postMessage({ command: 'openFile', file: file }); }
        function showDashboardPanel() { vscode.postMessage({ command: 'showDashboardPanel' }); }
        function showTaskDashboard() { vscode.postMessage({ command: 'showTaskDashboard' }); }
    </script>
</body>
</html>`;
    }

    // =========================================================================
    // ログ
    // =========================================================================

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        this.logs.push(logMessage);
        if (this.logs.length > 100) {
            this.logs.shift();
        }
    }

    // =========================================================================
    // ユーザー入力
    // =========================================================================

    async promptAndSendToButler(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: '執事への指令を入力してください、ご主人様',
            placeHolder: '例: このプロジェクトを分析して改善点を洗い出してください'
        });

        if (command) {
            await this.sendTaskToButler(command);
        }
    }

    async promptAndSendToMaid(): Promise<void> {
        const orderedMaids = getOrderedMaids();
        const maidOptions = orderedMaids
            .filter(m => this.agents.has(m.id))
            .map(m => ({ label: `${m.emoji} ${m.name}`, id: m.id }));

        if (maidOptions.length === 0) {
            vscode.window.showWarningMessage('メイドがまだおりません。先に起動してください。');
            return;
        }

        const selected = await vscode.window.showQuickPick(maidOptions, {
            placeHolder: '指示を送るメイドを選んでください'
        });

        if (!selected) return;

        const command = await vscode.window.showInputBox({
            prompt: `${selected.label}への指示を入力してください`,
            placeHolder: '例: このファイルをレビューしてください'
        });

        if (command) {
            // 2段階送信でメイドに指示
            await this.sendMessageToAgent(selected.id, command);
        }
    }

    // =========================================================================
    // クリーンアップ
    // =========================================================================

    /**
     * ターミナルが閉じられた時の処理
     */
    handleTerminalClosed(terminal: vscode.Terminal): void {
        // tmuxビューアターミナルが閉じられた場合
        if (terminal === this.tmuxViewerTerminal) {
            this.tmuxViewerTerminal = undefined;
            this.log('[tmux] ビューアターミナルが閉じられました');
            // 注: tmuxセッション自体は継続中（バックグラウンドで動作）
            return;
        }
    }

    /**
     * 特定のエージェントを終了
     */
    killAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (!agent || !this.tmuxManager) return;

        // tmuxウィンドウを終了
        this.tmuxManager.killWindow(agent.tmuxWindow);
        this.updateMasterStatus(agentId, 'offline');
        this.agents.delete(agentId);
        this.updateAgentPanel();
        this.updateDashboard();
        this.log(`[${agent.name}] を終了しました`);
    }

    dispose(): void {
        // tmuxセッションを終了（オプション - ユーザーが選択できるようにしても良い）
        // this.tmuxManager?.killSession();

        // ポーリングを停止
        this.stopTmuxWindowPolling();

        // ステータスバー通知タイマーを停止
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // ビューアターミナルを閉じる
        this.tmuxViewerTerminal?.dispose();

        // その他のリソースをクリーンアップ
        this.outputChannel.dispose();
        this.dashboardPanel?.dispose();
        this.fileWatcher?.dispose();
    }

    /**
     * tmuxセッションを終了
     */
    killTmuxSession(): void {
        if (this.tmuxManager) {
            this.tmuxManager.killSession();
            this.agents.clear();
            this.log('[tmux] セッションを終了しました');
            vscode.window.showInformationMessage('🎩 Maid Agent セッションを終了しました');
        }
    }
}

// =============================================================================
// 拡張機能のエントリーポイント
// =============================================================================

let controller: MultiAgentController;

export function activate(context: vscode.ExtensionContext) {
    controller = new MultiAgentController();
    controller.setContext(context);

    // エージェントパネル（サイドバー）を登録
    const agentPanelProvider = new AgentPanelProvider(context.extensionUri);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    agentPanelProvider.setWorkspaceRoot(workspaceRoot);
    controller.setAgentPanelProvider(agentPanelProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            AgentPanelProvider.viewType,
            agentPanelProvider
        )
    );

    // Dashboard パネルの永続化（VSCode再起動時に復元）
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('dashboardMarkdown', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
                // パネルのオプションを再設定
                panel.webview.options = { enableScripts: true };
                controller.restoreDashboardPanel(panel);
            }
        })
    );

    // ターミナル切り替え時にパネルを更新
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            controller.setCurrentAgentFromTerminal(terminal);
        })
    );

    // ターミナル終了時にエージェントを削除
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            controller.handleTerminalClosed(terminal);
        })
    );

    const commands = [
        vscode.commands.registerCommand('multiAgent.initialize', () => {
            controller.initializeWorkspace();
        }),
        vscode.commands.registerCommand('multiAgent.initializeGlobal', async () => {
            const success = await controller.initializeGlobalSettings();
            if (success) {
                const globalPath = getGlobalMaidAgentPath();
                vscode.window.showInformationMessage(`🌐 グローバル設定を初期化しました: ${globalPath}`);
                // フォルダを開く
                const uri = vscode.Uri.file(globalPath);
                vscode.commands.executeCommand('revealFileInOS', uri);
            }
        }),
        vscode.commands.registerCommand('multiAgent.resumeSessions', () => {
            controller.resumeSessions();
        }),
        vscode.commands.registerCommand('multiAgent.startButler', () => {
            controller.startButler();
        }),
        vscode.commands.registerCommand('multiAgent.startChiefMaid', () => {
            controller.startChiefMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startAgents', () => {
            controller.startButler();
            controller.startChiefMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startSelectedMaids', () => {
            controller.startSelectedMaids();
        }),
        vscode.commands.registerCommand('multiAgent.startMaidsByCount', () => {
            controller.startMaidsByCount();
        }),
        vscode.commands.registerCommand('multiAgent.startMaidsByCountRandom', () => {
            controller.startMaidsByCountRandom();
        }),
        vscode.commands.registerCommand('multiAgent.startAll', () => {
            controller.startAllAgents();
        }),
        vscode.commands.registerCommand('multiAgent.startAllByCount', () => {
            controller.startAllByCount();
        }),
        vscode.commands.registerCommand('multiAgent.startAllByCountRandom', () => {
            controller.startAllByCountRandom();
        }),
        vscode.commands.registerCommand('multiAgent.sendToButler', () => {
            controller.promptAndSendToButler();
        }),
        vscode.commands.registerCommand('multiAgent.sendToMaid', () => {
            controller.promptAndSendToMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startClaude', () => {
            controller.startClaudeOnAllAgents();
        }),
        vscode.commands.registerCommand('multiAgent.showDashboard', () => {
            controller.showDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.showWebDashboard', () => {
            controller.showWebDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.openDashboardInBrowser', () => {
            controller.openDashboardInBrowser();
        }),
        vscode.commands.registerCommand('multiAgent.watchFiles', () => {
            controller.startWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.stopWatchFiles', () => {
            controller.stopWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.openTmuxViewer', () => {
            controller.openTmuxViewer();
        }),
        vscode.commands.registerCommand('multiAgent.killSession', () => {
            controller.killTmuxSession();
        }),
        vscode.commands.registerCommand('multiAgent.processNotifications', () => {
            controller.manualProcessNotifications();
        }),
        vscode.commands.registerCommand('multiAgent.showStatus', () => {
            controller.showDebugStatus();
        }),
        vscode.commands.registerCommand('multiAgent.promoteRuleToGlobal', () => {
            controller.promoteRuleToGlobal();
        }),
    ];

    context.subscriptions.push(...commands);

    // Dashboard ボタン（タスク一覧）
    const dashboardStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    dashboardStatusBarItem.text = '📋 Dashboard';
    dashboardStatusBarItem.command = 'multiAgent.showWebDashboard';
    dashboardStatusBarItem.tooltip = 'クリックでタスク一覧を表示';
    dashboardStatusBarItem.show();
    context.subscriptions.push(dashboardStatusBarItem);

    // Controller ボタン（コントローラー）
    const controllerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    controllerStatusBarItem.text = '🎩 Controller';
    controllerStatusBarItem.command = 'multiAgent.showDashboard';
    controllerStatusBarItem.tooltip = 'クリックでコントローラーを表示';
    controllerStatusBarItem.show();
    context.subscriptions.push(controllerStatusBarItem);

    // コントローラーにステータスバーを設定（通知用）
    controller.setStatusBarItem(controllerStatusBarItem);
}

export function deactivate() {
    controller?.dispose();
}
