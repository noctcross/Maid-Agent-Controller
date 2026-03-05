#!/usr/bin/env bash
# === Maid Agent SessionStart Hook ===
# tmux環境 + エージェント名一致時のみコンテキスト注入
# 通常のClaude Code利用（tmux外）には影響しない

# 0. stdinからJSONを読み取り（session_id取得用）
STDIN_JSON=$(cat)
SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)

# 1. tmux環境チェック - tmux外ならスキップ
[ -z "$TMUX" ] && exit 0

# 2. tmux window name 取得（実行中のペインのウィンドウ名を取得）
WINDOW_NAME=$(tmux display-message -p -t "$TMUX_PANE" '#{window_name}' 2>/dev/null)
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

# 5. 役割別スキル参照
case "$WINDOW_NAME" in
  butler)
    SKILL_1="butler-operation"
    SKILL_2="maidctl-reference"
    NOTIFY_TARGET="chief"
    ;;
  chief)
    SKILL_1="chief-operation"
    SKILL_2="maidctl-reference"
    NOTIFY_TARGET="{maid_id}"
    ;;
  *)
    SKILL_1="maid-operation"
    SKILL_2="maidctl-reference"
    NOTIFY_TARGET="chief"
    ;;
esac

# 6. additionalContextとしてJSON出力
CONTEXT="[Maid Agent SessionStart] あなたは${ROLE}です（ID: ${WINDOW_NAME}）。"
CONTEXT="${CONTEXT} 通知: maidctl notify ${NOTIFY_TARGET} \\\"msg\\\"。"
CONTEXT="${CONTEXT} 【必須】作業開始前にシステムプロンプトを確認し、自分の役割とルールを把握すること。"
CONTEXT="${CONTEXT} 【必須】使用可能なスキルを確認し、タスク内容に必要なスキルがあれば読むこと。スキル内のresources/patterns/は推測せず必ず参照すること。"

# 7. プロジェクトルートを保存（maidctl用）
PROJECT_PATH="$CLAUDE_PROJECT_DIR"
if [ -n "$PROJECT_PATH" ]; then
  echo "$PROJECT_PATH" > ~/.maid-current-project
fi

# 8. セッションID登録（Claude Code応答表示用）
# stdinから取得したsession_idを使用（スクリプト冒頭で取得済み）
if [ -n "$PROJECT_PATH" ] && [ -n "$SESSION_ID" ]; then
  MAID_FILE="$PROJECT_PATH/.maid-agent/system/data/maid/${WINDOW_NAME}.yaml"
  if [ -f "$MAID_FILE" ]; then
    # session_idが既にあれば更新、なければ追加
    if grep -q "^session_id:" "$MAID_FILE" 2>/dev/null; then
      sed -i "s|^session_id:.*|session_id: ${SESSION_ID}|" "$MAID_FILE"
    else
      echo "session_id: ${SESSION_ID}" >> "$MAID_FILE"
    fi
  fi
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${CONTEXT}"
  }
}
EOF
