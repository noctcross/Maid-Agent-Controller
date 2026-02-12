#!/usr/bin/env bash
# === Maid Agent SessionStart Hook ===
# tmux環境 + エージェント名一致時のみコンテキスト注入
# 通常のClaude Code利用（tmux外）には影響しない

# 1. tmux環境チェック - tmux外ならスキップ
[ -z "$TMUX" ] && exit 0

# 2. tmux window name 取得
WINDOW_NAME=$(tmux display-message -p '#{window_name}' 2>/dev/null)
[ -z "$WINDOW_NAME" ] && exit 0

# 3. エージェント名一覧と照合
AGENTS="butler chief emma sophia lily rose alice may flora luna"
echo "$AGENTS" | grep -qw "$WINDOW_NAME" || exit 0

# 4. 役割判定
case "$WINDOW_NAME" in
  butler) ROLE="執事" ;;
  chief)  ROLE="メイド長" ;;
  *)      ROLE="メイド" ;;
esac

# 5. プロジェクトディレクトリ確認
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INSTRUCTIONS_DIR="$PROJECT_DIR/.maid-agent/agents/instructions"
QUICK_REF="$INSTRUCTIONS_DIR/QUICK_REFERENCE.md"

# 6. 役割別の指示書パス
case "$WINDOW_NAME" in
  butler) INSTRUCTION_FILE="$INSTRUCTIONS_DIR/butler.md" ;;
  chief)  INSTRUCTION_FILE="$INSTRUCTIONS_DIR/chief.md" ;;
  *)      INSTRUCTION_FILE="$INSTRUCTIONS_DIR/maid.md" ;;
esac

# 7. 役割別MCPツールリマインド
case "$WINDOW_NAME" in
  butler)
    MCP_TOOLS="create_task, list_tasks, get_task, get_team_status"
    NOTIFY_TARGET="chief"
    ;;
  chief)
    MCP_TOOLS="list_tasks, get_task, create_task, assign_task, update_task, get_team_status"
    NOTIFY_TARGET="{maid_id}"
    ;;
  *)
    MCP_TOOLS="get_my_task, update_status"
    NOTIFY_TARGET="chief"
    ;;
esac

# 8. additionalContextとしてJSON出力
CONTEXT="[Maid Agent SessionStart] あなたは${ROLE}です（ID: ${WINDOW_NAME}）。"
CONTEXT="${CONTEXT} MCPツール: ${MCP_TOOLS}。"
CONTEXT="${CONTEXT} 通知: .maid-agent/system/bin/maid-notify ${NOTIFY_TARGET} \\\"msg\\\"。"
CONTEXT="${CONTEXT} 指示書: ${INSTRUCTION_FILE} を必ず読み込んでください。"
CONTEXT="${CONTEXT} 通信方法: ${QUICK_REF} を必ず読み込んでください。"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${CONTEXT}"
  }
}
EOF
