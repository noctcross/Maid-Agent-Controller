#!/usr/bin/env bash
# flush-notify-queue.sh - busy キューをチャンク分割してフラッシュ（trigger B: idle遷移 / trigger A: idle+notify受信）
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

# メッセージ件数を事前カウント（ゼロなら早期 exit）
MSG_COUNT=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    msg=$(echo "$line" | sed 's/^\[[^]]*\] [^:]*: //')
    [ -z "$msg" ] && continue
    MSG_COUNT=$((MSG_COUNT + 1))
done < "$TMP_FILE"

[ "$MSG_COUNT" -eq 0 ] && { rm -f "$TMP_FILE"; exit 0; }

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Stop hook 完了・Claude Code idle 確定を待つ（hook 実行中の注入で Interrupted 扱いになるのを防ぐ）
sleep 2

# スクロールモード解除（-X cancel はtmuxコマンド・Escapeはペインに渡らない）
timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -X cancel 2>/dev/null || true

# チャンク分割・連続送信
# busy/idle混線回避方式: 連続送信 — chunk 送信後 sleep 2s でClaudeの処理開始を待ち次 chunk を注入
# idle連鎖（pane polling）は複雑なため、実用上十分な連続送信を採用
CHUNK=""
CHUNK_MSGS=0
CHUNK_INDEX=0

flush_chunk() {
    local chunk="$1"
    local n="$2"

    # 2チャンク目以降: 直前チャンクのClaude処理開始を待つ
    if [ "$CHUNK_INDEX" -gt 0 ]; then
        sleep 2.0
    fi

    timeout 5 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" -l "$chunk" 2>/dev/null || true
    sleep 1.0
    timeout 3 $MUX_CMD send-keys -t "${SESSION_NAME}:${AGENT_ID}" C-m 2>/dev/null || true

    echo "[$TIMESTAMP] [FLUSH-CHUNK-$((CHUNK_INDEX+1))] → ${AGENT_ID}: ${n}件" >> "$LOG_FILE" 2>/dev/null || true
    CHUNK_INDEX=$((CHUNK_INDEX + 1))
}

while IFS= read -r line; do
    [ -z "$line" ] && continue
    msg=$(echo "$line" | sed 's/^\[[^]]*\] [^:]*: //')
    [ -z "$msg" ] && continue

    msg_len=${#msg}
    if [ -z "$CHUNK" ]; then
        new_len=$msg_len
    else
        new_len=$(( ${#CHUNK} + 1 + msg_len ))
    fi

    # 件数または文字数が上限に達したら現 chunk を送信して新 chunk 開始
    if [ -n "$CHUNK" ] && { [ "$CHUNK_MSGS" -ge "$BATCH_CHUNK_COUNT" ] || [ "$new_len" -gt "$BATCH_CHUNK_CHARS" ]; }; then
        flush_chunk "$CHUNK" "$CHUNK_MSGS"
        CHUNK="$msg"
        CHUNK_MSGS=1
    else
        if [ -z "$CHUNK" ]; then
            CHUNK="$msg"
        else
            CHUNK="${CHUNK}"$'\n'"${msg}"
        fi
        CHUNK_MSGS=$((CHUNK_MSGS + 1))
    fi
done < "$TMP_FILE"

# 最終 chunk を送信
if [ -n "$CHUNK" ]; then
    flush_chunk "$CHUNK" "$CHUNK_MSGS"
fi

echo "[$TIMESTAMP] [FLUSH-DONE] → ${AGENT_ID}: ${MSG_COUNT}件 / ${CHUNK_INDEX}chunk(s)" >> "$LOG_FILE" 2>/dev/null || true

# send 試行後に tmp を削除（send-keys 失敗/ハングでもメッセージが即座に消えない）
rm -f "$TMP_FILE"

exit 0
