#!/usr/bin/env bash
# === Maid Agent SessionStart Hook ===
# tmux環境 + エージェント名一致時のみコンテキスト注入
# 通常のClaude Code利用（tmux外）には影響しない

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

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${CONTEXT}"
  }
}
EOF
