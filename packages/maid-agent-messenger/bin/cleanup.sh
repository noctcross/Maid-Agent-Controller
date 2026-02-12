#!/usr/bin/env bash
# =============================================================================
# cleanup.sh - Maid Agent クリーンアップスクリプト
#
# アンインストール時にMaid Agentのリソースを削除するためのスクリプト
#
# 使用法:
#   cleanup.sh --global              グローバル設定を削除
#   cleanup.sh --project <path>      指定プロジェクトの設定を削除
#   cleanup.sh --all                 全リソースを削除
#   cleanup.sh --tmux-only           tmuxセッションのみ削除
#   cleanup.sh --dry-run [options]   削除せず対象を表示
#
# オプション:
#   --force                          確認なしで削除（危険）
#   --dry-run                        削除対象の表示のみ
#   --help                           ヘルプを表示
# =============================================================================

set -euo pipefail

# =============================================================================
# 定数定義
# =============================================================================

GLOBAL_DIR="$HOME/.maid-agent"
TMUX_SESSION_PATTERN="maid-agent-"

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# ユーティリティ関数
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# バイト数を人間が読みやすい形式に変換
human_readable_size() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt $((1024 * 1024)) ]]; then
        echo "$((bytes / 1024))KB"
    elif [[ $bytes -lt $((1024 * 1024 * 1024)) ]]; then
        echo "$((bytes / 1024 / 1024))MB"
    else
        echo "$((bytes / 1024 / 1024 / 1024))GB"
    fi
}

# ディレクトリサイズを取得
get_dir_size() {
    local path="$1"
    if [[ -d "$path" ]]; then
        du -sb "$path" 2>/dev/null | cut -f1 || echo 0
    else
        echo 0
    fi
}

# ファイルサイズを取得
get_file_size() {
    local path="$1"
    if [[ -f "$path" ]]; then
        stat -c%s "$path" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# シンボリックリンクかどうかを確認
is_symlink() {
    [[ -L "$1" ]]
}

# 確認プロンプト
confirm_action() {
    local message="$1"
    local default="${2:-n}"

    if [[ "$FORCE_MODE" == "true" ]]; then
        return 0
    fi

    local prompt
    if [[ "$default" == "y" ]]; then
        prompt="[Y/n]"
    else
        prompt="[y/N]"
    fi

    echo -e "${YELLOW}$message${NC} $prompt"
    read -r response

    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        [nN][oO]|[nN])
            return 1
            ;;
        "")
            if [[ "$default" == "y" ]]; then
                return 0
            else
                return 1
            fi
            ;;
        *)
            return 1
            ;;
    esac
}

# 安全な削除（シンボリックリンクチェック付き）
safe_delete() {
    local path="$1"
    local description="${2:-$path}"

    if [[ ! -e "$path" ]] && [[ ! -L "$path" ]]; then
        log_info "スキップ: $description (存在しません)"
        return 0
    fi

    # シンボリックリンクの場合は警告
    if is_symlink "$path"; then
        log_warn "シンボリックリンクを検出: $path"
        local target
        target=$(readlink -f "$path" 2>/dev/null || echo "unknown")
        log_warn "リンク先: $target"
        if ! confirm_action "このシンボリックリンクを削除しますか？"; then
            log_info "スキップしました: $path"
            return 0
        fi
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        local size
        if [[ -d "$path" ]]; then
            size=$(human_readable_size "$(get_dir_size "$path")")
        else
            size=$(human_readable_size "$(get_file_size "$path")")
        fi
        log_info "[DRY-RUN] 削除予定: $description ($size)"
        return 0
    fi

    if [[ -d "$path" ]]; then
        rm -rf "$path"
    else
        rm -f "$path"
    fi

    log_success "削除しました: $description"
}

# =============================================================================
# クリーンアップ関数
# =============================================================================

# tmuxセッションを削除
cleanup_tmux_sessions() {
    log_info "tmuxセッションを検索中..."

    local sessions
    sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^${TMUX_SESSION_PATTERN}" || true)

    if [[ -z "$sessions" ]]; then
        log_info "Maid Agent関連のtmuxセッションはありません"
        return 0
    fi

    local count
    count=$(echo "$sessions" | wc -l)
    log_info "検出されたセッション: $count 件"

    echo "$sessions" | while read -r session; do
        if [[ -n "$session" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] 終了予定: tmux session '$session'"
            else
                if confirm_action "tmuxセッション '$session' を終了しますか？"; then
                    tmux kill-session -t "$session" 2>/dev/null || log_warn "セッションの終了に失敗: $session"
                    log_success "終了しました: $session"
                else
                    log_info "スキップしました: $session"
                fi
            fi
        fi
    done
}

# グローバル設定を削除
cleanup_global() {
    log_info "グローバル設定をクリーンアップ中..."

    if [[ ! -d "$GLOBAL_DIR" ]]; then
        log_info "グローバル設定ディレクトリは存在しません: $GLOBAL_DIR"
        return 0
    fi

    # サイズ計算
    local total_size
    total_size=$(get_dir_size "$GLOBAL_DIR")
    log_info "グローバル設定サイズ: $(human_readable_size "$total_size")"

    echo ""
    echo "削除対象:"
    echo "  - maid-agent-messenger/node_modules/ (再生成可能)"
    echo "  - maid-agent-messenger/dist/          (再生成可能)"
    echo "  - maid-agent-messenger/logs/          (一時ファイル)"
    echo ""

    # 削除推奨（確認なし）
    safe_delete "$GLOBAL_DIR/maid-agent-messenger/node_modules" "node_modules (パッケージ)"
    safe_delete "$GLOBAL_DIR/maid-agent-messenger/dist" "dist (ビルド成果物)"
    safe_delete "$GLOBAL_DIR/maid-agent-messenger/logs" "logs (ログファイル)"

    # 確認が必要なもの
    echo ""
    log_warn "以下はユーザーデータを含む可能性があります:"

    if [[ -d "$GLOBAL_DIR/rules" ]]; then
        if confirm_action "rules/ (ユーザー作成ルール) を削除しますか？"; then
            safe_delete "$GLOBAL_DIR/rules" "rules (ルール定義)"
        fi
    fi

    if [[ -d "$GLOBAL_DIR/skills" ]]; then
        if confirm_action "skills/ (ユーザー作成スキル) を削除しますか？"; then
            safe_delete "$GLOBAL_DIR/skills" "skills (スキル定義)"
        fi
    fi

    if [[ -d "$GLOBAL_DIR/system/config" ]]; then
        if confirm_action "system/config/ (設定ファイル) を削除しますか？"; then
            safe_delete "$GLOBAL_DIR/system/config" "system/config (設定)"
        fi
    fi

    if [[ -d "$GLOBAL_DIR/reports" ]]; then
        if confirm_action "reports/ (グローバルレポート) を削除しますか？"; then
            safe_delete "$GLOBAL_DIR/reports" "reports (レポート)"
        fi
    fi

    # 残りのファイルがあるか確認
    if [[ -d "$GLOBAL_DIR" ]]; then
        local remaining
        remaining=$(find "$GLOBAL_DIR" -type f 2>/dev/null | wc -l)
        if [[ "$remaining" -eq 0 ]]; then
            safe_delete "$GLOBAL_DIR" "~/.maid-agent (空ディレクトリ)"
        else
            log_info "残りのファイル: $remaining 件"
            if confirm_action "残りの全ファイルを含めて ~/.maid-agent を完全に削除しますか？"; then
                safe_delete "$GLOBAL_DIR" "~/.maid-agent (完全削除)"
            fi
        fi
    fi

    log_success "グローバル設定のクリーンアップが完了しました"
}

# プロジェクト設定を削除
cleanup_project() {
    local project_path="$1"
    local maid_agent_dir="$project_path/.maid-agent"

    log_info "プロジェクト設定をクリーンアップ中: $project_path"

    if [[ ! -d "$maid_agent_dir" ]]; then
        log_info ".maid-agent ディレクトリは存在しません: $maid_agent_dir"
        return 0
    fi

    # サイズ計算
    local total_size
    total_size=$(get_dir_size "$maid_agent_dir")
    log_info "プロジェクト設定サイズ: $(human_readable_size "$total_size")"

    echo ""
    echo "削除対象（一時ファイル）:"
    echo "  - system/data/maid/           (メイド状態ファイル)"
    echo "  - system/data/reports/        (現在の報告書)"
    echo "  - system/data/notifications/  (通知ファイル)"
    echo "  - system/config/.session-name (セッション名)"
    echo ""

    # 削除推奨（一時ファイル）
    safe_delete "$maid_agent_dir/system/data/maid" "maid/ (状態ファイル)"
    safe_delete "$maid_agent_dir/system/data/reports" "reports/ (現在の報告書)"
    safe_delete "$maid_agent_dir/system/data/notifications" "notifications/ (通知)"
    safe_delete "$maid_agent_dir/system/config/.session-name" ".session-name (セッション名)"

    # 確認が必要なもの
    echo ""
    log_warn "以下はユーザーデータを含む可能性があります:"

    if [[ -d "$maid_agent_dir/master" ]]; then
        if confirm_action "master/ (ご主人様のメモ・報告書) を削除しますか？"; then
            safe_delete "$maid_agent_dir/master" "master/ (ご主人様エリア)"
        fi
    fi

    if [[ -d "$maid_agent_dir/agents" ]]; then
        if confirm_action "agents/ (エージェント設定・カスタマイズ) を削除しますか？"; then
            safe_delete "$maid_agent_dir/agents" "agents/ (エージェント設定)"
        fi
    fi

    if [[ -f "$maid_agent_dir/system/data/tasks.yaml" ]]; then
        if confirm_action "tasks.yaml (作業履歴) を削除しますか？"; then
            safe_delete "$maid_agent_dir/system/data/tasks.yaml" "tasks.yaml (作業履歴)"
        fi
    fi

    # CLAUDE.md はGit管理下のため残す
    if [[ -f "$maid_agent_dir/CLAUDE.md" ]]; then
        log_info "スキップ: CLAUDE.md (Git管理下の可能性が高いため)"
    fi

    # 残りのファイルがあるか確認
    if [[ -d "$maid_agent_dir" ]]; then
        local remaining
        remaining=$(find "$maid_agent_dir" -type f 2>/dev/null | wc -l)
        if [[ "$remaining" -eq 0 ]]; then
            safe_delete "$maid_agent_dir" ".maid-agent (空ディレクトリ)"
        else
            log_info "残りのファイル: $remaining 件"
            if confirm_action "残りの全ファイルを含めて .maid-agent を完全に削除しますか？"; then
                safe_delete "$maid_agent_dir" ".maid-agent (完全削除)"
            fi
        fi
    fi

    log_success "プロジェクト設定のクリーンアップが完了しました"
}

# 全リソースを削除
cleanup_all() {
    local project_path="${1:-}"

    log_info "全リソースをクリーンアップ中..."
    echo ""

    # tmuxセッション
    cleanup_tmux_sessions
    echo ""

    # グローバル設定
    cleanup_global
    echo ""

    # プロジェクト設定（指定がある場合）
    if [[ -n "$project_path" ]]; then
        cleanup_project "$project_path"
    else
        log_info "プロジェクトパスが指定されていないため、プロジェクト設定はスキップします"
        log_info "プロジェクト設定も削除する場合は --all --project <path> を使用してください"
    fi

    echo ""
    log_success "全リソースのクリーンアップが完了しました"
}

# =============================================================================
# ヘルプ表示
# =============================================================================

show_help() {
    cat << 'EOF'
Maid Agent クリーンアップスクリプト

使用法:
    cleanup.sh [OPTIONS] [MODE]

モード:
    --global              グローバル設定 (~/.maid-agent/) を削除
    --project <path>      指定プロジェクトの .maid-agent/ を削除
    --all                 全リソースを削除（tmux + global）
    --all --project <p>   全リソースを削除（tmux + global + project）
    --tmux-only           tmuxセッションのみ削除

オプション:
    --dry-run             削除せず、削除対象を表示のみ
    --force               確認なしで削除（危険）
    --help                このヘルプを表示

削除対象:
    グローバル設定 (~/.maid-agent/):
      - maid-agent-messenger/node_modules/  (削除推奨)
      - maid-agent-messenger/dist/          (削除推奨)
      - maid-agent-messenger/logs/          (削除推奨)
      - system/config/                      (確認必要)
      - rules/                              (確認必要)
      - skills/                             (確認必要)

    プロジェクト設定 ({project}/.maid-agent/):
      - system/data/maid/                   (削除推奨)
      - system/data/reports/                (削除推奨)
      - system/data/notifications/          (削除推奨)
      - system/config/.session-name         (削除推奨)
      - master/                             (確認必要)
      - agents/                             (確認必要)
      - system/data/tasks.yaml              (確認必要)
      - CLAUDE.md                           (残すべき)

    tmuxセッション:
      - maid-agent-* パターンに一致するセッション

例:
    # グローバル設定を削除
    ~/.maid-agent/maid-agent-messenger/bin/cleanup.sh --global

    # プロジェクト設定を削除
    ~/.maid-agent/maid-agent-messenger/bin/cleanup.sh --project /path/to/project

    # 全リソースを削除（確認プロンプトあり）
    ~/.maid-agent/maid-agent-messenger/bin/cleanup.sh --all --project /path/to/project

    # 削除対象を確認（実際には削除しない）
    ~/.maid-agent/maid-agent-messenger/bin/cleanup.sh --dry-run --all

EOF
}

# =============================================================================
# メイン処理
# =============================================================================

main() {
    # デフォルト値
    DRY_RUN="false"
    FORCE_MODE="false"
    MODE=""
    PROJECT_PATH=""

    # 引数パース
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                show_help
                exit 0
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --force|-f)
                FORCE_MODE="true"
                shift
                ;;
            --global)
                MODE="global"
                shift
                ;;
            --project)
                if [[ $# -lt 2 ]]; then
                    log_error "--project にはパスが必要です"
                    exit 1
                fi
                PROJECT_PATH="$2"
                if [[ -z "$MODE" ]]; then
                    MODE="project"
                fi
                shift 2
                ;;
            --all)
                MODE="all"
                shift
                ;;
            --tmux-only)
                MODE="tmux"
                shift
                ;;
            *)
                log_error "不明なオプション: $1"
                echo "ヘルプを表示するには --help を使用してください"
                exit 1
                ;;
        esac
    done

    # モードが指定されていない場合
    if [[ -z "$MODE" ]]; then
        log_error "モードを指定してください: --global, --project, --all, --tmux-only"
        echo "ヘルプを表示するには --help を使用してください"
        exit 1
    fi

    # ヘッダー表示
    echo "========================================"
    echo "  Maid Agent クリーンアップ"
    echo "========================================"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY-RUN モード: 実際には削除されません"
        echo ""
    fi

    if [[ "$FORCE_MODE" == "true" ]]; then
        log_warn "FORCE モード: 確認なしで削除します"
        echo ""
    fi

    # 実行
    case "$MODE" in
        global)
            cleanup_global
            ;;
        project)
            if [[ -z "$PROJECT_PATH" ]]; then
                log_error "--project にはパスが必要です"
                exit 1
            fi
            if [[ ! -d "$PROJECT_PATH" ]]; then
                log_error "プロジェクトパスが存在しません: $PROJECT_PATH"
                exit 1
            fi
            cleanup_project "$PROJECT_PATH"
            ;;
        all)
            cleanup_all "$PROJECT_PATH"
            ;;
        tmux)
            cleanup_tmux_sessions
            ;;
    esac

    echo ""
    echo "========================================"
    log_success "クリーンアップが完了しました"
    echo "========================================"
}

# エントリーポイント
main "$@"
