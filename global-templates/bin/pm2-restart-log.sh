#!/bin/bash
#
# PM2再起動ログ記録スクリプト
#
# 使用方法:
#   pm2-restart-log.sh "再起動理由"
#   pm2-restart-log.sh --reason "メンテナンス"
#
# ログ出力先:
#   ~/.maid-agent/maid-agent-messenger/logs/restart-history.log
#

set -euo pipefail

# 定数
readonly PROCESS_NAME="maid-agent-messenger"
readonly LOG_DIR="${HOME}/.maid-agent/maid-agent-messenger/logs"
readonly LOG_FILE="${LOG_DIR}/restart-history.log"
readonly MAX_LOG_SIZE=1048576  # 1MB

# 使用方法表示
usage() {
    cat << EOF
使用方法: $(basename "$0") [OPTIONS] [REASON]

PM2プロセスを再起動し、ログを記録します。

OPTIONS:
    -r, --reason REASON    再起動理由（必須）
    -h, --help             このヘルプを表示

EXAMPLES:
    $(basename "$0") "メンテナンス"
    $(basename "$0") --reason "設定変更のため"
EOF
    exit 1
}

# JSONエスケープ処理
# " → \" 、 \ → \\ 、改行 → \n 、タブ → \t
escape_json() {
    local str="$1"
    str="${str//\\/\\\\}"   # \ → \\
    str="${str//\"/\\\"}"   # " → \"
    str="${str//$'\n'/\\n}" # 改行 → \n
    str="${str//$'\t'/\\t}" # タブ → \t
    echo "$str"
}

# ログローテーション（1MB超過時）
rotate_log() {
    if [[ -f "$LOG_FILE" ]] && [[ $(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]]; then
        mv "$LOG_FILE" "${LOG_FILE}.1"
        echo "# ログローテーション: $(date -Iseconds)" > "$LOG_FILE"
    fi
}

# ログ記録
log_restart() {
    local reason="$1"
    local timestamp
    local user
    local hostname
    local escaped_reason

    timestamp=$(date -Iseconds)
    user=$(whoami)
    hostname=$(hostname)
    escaped_reason=$(escape_json "$reason")

    # ログディレクトリ作成
    mkdir -p "$LOG_DIR"

    # ログローテーション
    rotate_log

    # ログ記録（JSON Lines形式）
    echo "{\"timestamp\":\"${timestamp}\",\"user\":\"${user}\",\"hostname\":\"${hostname}\",\"action\":\"restart\",\"reason\":\"${escaped_reason}\"}" >> "$LOG_FILE"
}

# PM2再起動実行
restart_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo "エラー: pm2 がインストールされていません" >&2
        exit 1
    fi

    # プロセス存在確認
    if ! pm2 describe "$PROCESS_NAME" &> /dev/null; then
        echo "エラー: プロセス '${PROCESS_NAME}' が見つかりません" >&2
        exit 1
    fi

    pm2 restart "$PROCESS_NAME"
}

# メイン処理
main() {
    local reason=""

    # 引数解析
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -r|--reason)
                reason="$2"
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                # 引数なしの場合は最初の引数を理由として扱う
                if [[ -z "$reason" ]]; then
                    reason="$1"
                fi
                shift
                ;;
        esac
    done

    # 理由が指定されていない場合
    if [[ -z "$reason" ]]; then
        echo "エラー: 再起動理由を指定してください" >&2
        usage
    fi

    # ログ記録
    log_restart "$reason"

    # PM2再起動
    restart_pm2

    echo "✅ PM2再起動完了（ログ記録済み: ${LOG_FILE}）"
}

main "$@"
