#!/usr/bin/env bash
# flush-notify-queue.sh - busy キューをフラッシュ（idle 遷移時に agent-status-hook.sh から呼ばれる）
# 引数: <agent_id> [project_dir]

set -euo pipefail

AGENT_ID="${1:-}"
PROJECT_DIR="${2:-$(pwd)}"

[ -z "$AGENT_ID" ] && { echo "使用法: flush-notify-queue.sh <agent_id> [project_dir]" >&2; exit 1; }

QUEUE_DIR="${PROJECT_DIR}/.maid-agent/system/data/notifications/queue"
QUEUE_FILE="${QUEUE_DIR}/${AGENT_ID}.txt"
LOCK_FILE="${QUEUE_DIR}/${AGENT_ID}.lock"
TMP_FILE="${QUEUE_DIR}/${AGENT_ID}.flush.tmp"
SESSION_FILE="${PROJECT_DIR}/.maid-agent/system/config/.session-name"
SETTINGS_FILE="${PROJECT_DIR}/.maid-agent/system/config/settings.yaml"
LOG_FILE="${PROJECT_DIR}/.maid-agent/system/data/notifications/history.log"

# キューファイルが存在・非空か確認
[ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ] || exit 0
# セッション名ファイルが存在するか確認
[ -f "$SESSION_FILE" ] || { echo "flush: session file not found, aborting" >&2; exit 0; }

SESSION_NAME=$(cat "$SESSION_FILE" | tr -d '\r\n')

# マルチプレクサ種別を特定（maid-notify と同じロジック）
get_multiplexer_command() {
    if [ -f "$SETTINGS_FILE" ]; then
        local mux_type
        mux_type=$(grep -A10 "^multiplexer:" "$SETTINGS_FILE" 2>/dev/null \
            | grep -v "^[[:space:]]*#" | grep "type:" | head -1 \
            | awk '{print $2}' | tr -d '\r')
        if [ -n "$mux_type" ] && [ "$mux_type" != "auto" ]; then
            echo "$mux_type"; return 0
        fi
    fi
    if [ "${MAID_MULTIPLEXER:-}" = "psmux" ]; then echo "psmux"; return 0; fi
    if [ -n "${TMUX:-}" ]; then echo "tmux"
    elif command -v psmux &>/dev/null; then echo "psmux"
    else echo "tmux"; fi
}

MUX_CMD=$(get_multiplexer_command)

# キューを flock で排他ロックし、tmp にコピーしてから削除（原子的な取り出し）
mkdir -p "$QUEUE_DIR"
(
    flock -x 9
    if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
        cp "$QUEUE_FILE" "$TMP_FILE"
        rm -f "$QUEUE_FILE"
    fi
) 9>"$LOCK_FILE"

# tmp ファイルがなければ他の flush が先に処理済み
[ -f "$TMP_FILE" ] && [ -s "$TMP_FILE" ] || exit 0

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 各メッセージを順次送信
while IFS= read -r line; do
    [ -z "$line" ] && continue

    # "[timestamp] sender: message" 形式から本文を抽出
    msg=$(echo "$line" | sed 's/^\[[^]]*\] [^:]*: //')
    [ -z "$msg" ] && continue

    # スクロールモード解除
    $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -X cancel 2>/dev/null || true
    $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" Escape 2>/dev/null || true
    sleep 0.2

    # メッセージ送信
    $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -l "$msg" 2>/dev/null
    sleep 1.0
    $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" C-m 2>/dev/null

    echo "[$TIMESTAMP] [FLUSH] → ${AGENT_ID}: $msg" >> "$LOG_FILE" 2>/dev/null || true
done < "$TMP_FILE"

rm -f "$TMP_FILE"
exit 0
