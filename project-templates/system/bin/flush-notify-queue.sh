#!/usr/bin/env bash
# flush-notify-queue.sh - busy キューをまとめてフラッシュ（trigger B: idle遷移 / trigger A: idle+notify受信）
# 引数: <agent_id> [project_dir]

set -euo pipefail

AGENT_ID="${1:-}"
PROJECT_DIR="${2:-$(pwd)}"

[ -z "$AGENT_ID" ] && { echo "使用法: flush-notify-queue.sh <agent_id> [project_dir]" >&2; exit 1; }

QUEUE_DIR="${PROJECT_DIR}/.maid-agent/system/data/notifications/queue"
QUEUE_FILE="${QUEUE_DIR}/${AGENT_ID}.txt"
LOCK_FILE="${QUEUE_DIR}/${AGENT_ID}.lock"
TMP_FILE="${QUEUE_DIR}/${AGENT_ID}.flush.$$.tmp"
SESSION_FILE="${PROJECT_DIR}/.maid-agent/system/config/.session-name"
SETTINGS_FILE="${PROJECT_DIR}/.maid-agent/system/config/settings.yaml"
LOG_FILE="${PROJECT_DIR}/.maid-agent/system/data/notifications/history.log"

# 件数・文字数がこれを超えたらキックモード（軽い通知のみ送る）
BATCH_KICK_COUNT=8
BATCH_KICK_CHARS=1000

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

# 全メッセージを収集してバッチ文字列を構築
BATCH=""
MSG_COUNT=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    # "[timestamp] sender: message" 形式から本文を抽出
    msg=$(echo "$line" | sed 's/^\[[^]]*\] [^:]*: //')
    [ -z "$msg" ] && continue
    MSG_COUNT=$((MSG_COUNT + 1))
    if [ -z "$BATCH" ]; then
        BATCH="$msg"
    else
        BATCH="${BATCH}
${msg}"
    fi
done < "$TMP_FILE"

[ "$MSG_COUNT" -eq 0 ] && { rm -f "$TMP_FILE"; exit 0; }

BATCH_CHARS=${#BATCH}

# Stop hook 完了・Claude Code idle 確定を待つ（hook 実行中の注入で Interrupted 扱いになるのを防ぐ）
sleep 2

# スクロールモード解除（-X cancel はtmuxコマンド・Escapeはペインに渡らない）
timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -X cancel 2>/dev/null || true

if [ "$MSG_COUNT" -gt "$BATCH_KICK_COUNT" ] || [ "$BATCH_CHARS" -gt "$BATCH_KICK_CHARS" ]; then
    # キックモード: 件数 or 文字数超過 → 軽い通知のみ送り、メイドが内容を把握する
    PREVIEW=$(echo "$BATCH" | head -c 150 | tr '\n' ' ')
    KICK_MSG="[${MSG_COUNT}件の通知: ${PREVIEW}...]"
    timeout 5 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -l "$KICK_MSG" 2>/dev/null || true
    echo "[$TIMESTAMP] [FLUSH-KICK] → ${AGENT_ID}: ${MSG_COUNT}件" >> "$LOG_FILE" 2>/dev/null || true
else
    # バッチモード: 全件まとめて1回 send-keys
    timeout 5 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -l "$BATCH" 2>/dev/null || true
    echo "[$TIMESTAMP] [FLUSH-BATCH] → ${AGENT_ID}: ${MSG_COUNT}件" >> "$LOG_FILE" 2>/dev/null || true
fi

sleep 1.0
timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" C-m 2>/dev/null || true

# send 試行後に tmp を削除（send-keys 失敗/ハングでもメッセージが即座に消えない）
rm -f "$TMP_FILE"

exit 0
