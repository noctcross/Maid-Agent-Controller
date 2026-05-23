#!/usr/bin/env bash
# agent-status-hook.sh - UserPromptSubmit/Stop/StopFailure hook で claude_status を更新
# 引数: busy | idle
# stdin: Claude Code hook JSON {"session_id": "..."}

set -euo pipefail

STATUS="${1:-}"
if [ -z "$STATUS" ] || { [ "$STATUS" != "busy" ] && [ "$STATUS" != "idle" ]; }; then
    echo "使用法: agent-status-hook.sh busy|idle" >&2
    exit 1
fi

# 実行ディレクトリ = CLAUDE_PROJECT_DIR（hook 実行時に設定される）
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MAID_DIR="${PROJECT_DIR}/.maid-agent/system/data/maid"

# stdin から session_id を取得
STDIN_JSON=$(cat)
SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0
[ -d "$MAID_DIR" ] || exit 0

# session_id が一致する maid yaml を特定（grep -rl で検索）
MAID_YAML=$(grep -rl "session_id: ${SESSION_ID}" "${MAID_DIR}" 2>/dev/null | head -1 || true)
[ -z "$MAID_YAML" ] && exit 0

AGENT_ID=$(basename "$MAID_YAML" .yaml)

# claude_status フィールドを更新（flock で maidctl との競合を防ぐ）
(
    flock -x 200
    if grep -q "^claude_status:" "$MAID_YAML" 2>/dev/null; then
        sed -i "s/^claude_status:.*/claude_status: ${STATUS}/" "$MAID_YAML"
    else
        echo "claude_status: ${STATUS}" >> "$MAID_YAML"
    fi
) 200>"${MAID_YAML}.lock"

# idle 遷移時: busy キューをフラッシュ
if [ "$STATUS" = "idle" ]; then
    QUEUE_FILE="${PROJECT_DIR}/.maid-agent/system/data/notifications/queue/${AGENT_ID}.txt"
    if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
        setsid bash "${PROJECT_DIR}/.maid-agent/system/bin/flush-notify-queue.sh" \
            "$AGENT_ID" "$PROJECT_DIR" &
    fi
fi

exit 0
