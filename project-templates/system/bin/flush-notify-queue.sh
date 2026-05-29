#!/usr/bin/env bash
# flush-notify-queue.sh - queueから1チャンク送信してidle連鎖を起動（trigger B: idle遷移 / trigger A: idle+notify受信）
# 引数: <agent_id> [project_dir]

set -euo pipefail

AGENT_ID="${1:-}"
PROJECT_DIR="${2:-$(pwd)}"

[ -z "$AGENT_ID" ] && { echo "使用法: flush-notify-queue.sh <agent_id> [project_dir]" >&2; exit 1; }

QUEUE_DIR="${PROJECT_DIR}/.maid-agent/system/data/notifications/queue"
QUEUE_FILE="${QUEUE_DIR}/${AGENT_ID}.txt"
LOCK_FILE="${QUEUE_DIR}/${AGENT_ID}.lock"
TMP_FILE="${QUEUE_DIR}/${AGENT_ID}.flush.$$.tmp"
REMAINING_FILE="${QUEUE_DIR}/${AGENT_ID}.remaining.$$.tmp"
SESSION_FILE="${PROJECT_DIR}/.maid-agent/system/config/.session-name"
SETTINGS_FILE="${PROJECT_DIR}/.maid-agent/system/config/settings.yaml"
LOG_FILE="${PROJECT_DIR}/.maid-agent/system/data/notifications/history.log"

# デフォルト値（settings.yaml の notify セクションで上書き可能）
BATCH_CHUNK_COUNT=8
BATCH_CHUNK_CHARS=1000

# settings.yaml から閾値を読み込む
if [ -f "$SETTINGS_FILE" ]; then
    _val=$(grep -A10 "^notify:" "$SETTINGS_FILE" 2>/dev/null \
        | grep "batch_chunk_count:" | head -1 | awk '{print $2}' | tr -d '\r')
    [ -n "$_val" ] && BATCH_CHUNK_COUNT="$_val"
    _val=$(grep -A10 "^notify:" "$SETTINGS_FILE" 2>/dev/null \
        | grep "batch_chunk_chars:" | head -1 | awk '{print $2}' | tr -d '\r')
    [ -n "$_val" ] && BATCH_CHUNK_CHARS="$_val"
fi

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

# Stop hook 完了・Claude Code idle 確定を待つ（hook 実行中の注入で Interrupted 扱いになるのを防ぐ）
sleep 2

# スクロールモード解除（-X cancel はtmuxコマンド・Escapeはペインに渡らない）
timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -X cancel 2>/dev/null || true

# idle連鎖方式: 先頭1チャンク（件数・文字数上限内）を取り出し、残りはqueueに書き戻す
# → メイドがチャンク処理→idle遷移→agent-status-hookがqueue残りを検知→次チャンクflush の連鎖
CHUNK=""
CHUNK_MSGS=0
CHUNK_DONE=false

while IFS= read -r line; do
    [ -z "$line" ] && continue
    msg=$(echo "$line" | sed 's/^\[[^]]*\] [^:]*: //')
    [ -z "$msg" ] && continue

    # \n エスケープを実改行に復元（maid-notify が改行入り notify を1行にエスケープして保存したもの）
    msg="${msg//\\n/$'\n'}"

    if [ "$CHUNK_DONE" = "true" ]; then
        printf '%s\n' "$line" >> "$REMAINING_FILE"
        continue
    fi

    msg_len=${#msg}
    if [ -z "$CHUNK" ]; then
        new_len=$msg_len
    else
        new_len=$(( ${#CHUNK} + 1 + msg_len ))
    fi

    # 件数または文字数が上限に達したら、このメッセージ以降を残りに回す
    # 1 notify は分割しない: 1件目が閾値を超えていても CHUNK が空なら必ず送る
    if [ -n "$CHUNK" ] && { [ "$CHUNK_MSGS" -ge "$BATCH_CHUNK_COUNT" ] || [ "$new_len" -gt "$BATCH_CHUNK_CHARS" ]; }; then
        CHUNK_DONE=true
        printf '%s\n' "$line" >> "$REMAINING_FILE"
    else
        if [ -z "$CHUNK" ]; then
            CHUNK="$msg"
        else
            CHUNK="${CHUNK}"$'\n'"${msg}"
        fi
        CHUNK_MSGS=$((CHUNK_MSGS + 1))
    fi
done < "$TMP_FILE"

# 残りがあればqueueに書き戻す（FIFO順保持: 残り先頭→処理中に追加された新着は後ろ）
if [ -f "$REMAINING_FILE" ] && [ -s "$REMAINING_FILE" ]; then
    (
        flock -x 9
        if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
            cat "$QUEUE_FILE" >> "$REMAINING_FILE"
        fi
        mv "$REMAINING_FILE" "$QUEUE_FILE"
    ) 9>"$LOCK_FILE"
else
    rm -f "$REMAINING_FILE" 2>/dev/null || true
fi

# 送信するチャンクがなければ終了
[ -z "$CHUNK" ] && { rm -f "$TMP_FILE"; exit 0; }

# 1チャンクを送信
timeout 5 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -l "$CHUNK" 2>/dev/null || true
sleep 1.0
timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" C-m 2>/dev/null || true

echo "[$TIMESTAMP] [FLUSH] → ${AGENT_ID}: ${CHUNK_MSGS}件送信" >> "$LOG_FILE" 2>/dev/null || true

# send 試行後に tmp を削除（send-keys 失敗/ハングでもメッセージが即座に消えない）
rm -f "$TMP_FILE"

exit 0
