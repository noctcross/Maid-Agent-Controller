#!/usr/bin/env bash
# === Maid Agent SessionStart Hook ===
# tmux/psmux環境 + エージェント名一致時のみコンテキスト注入
# 通常のClaude Code利用（マルチプレクサ外）には影響しない

# 0. stdinからJSONを読み取り（session_id取得用）
STDIN_JSON=$(cat)
SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)

# 1. マルチプレクサ環境検出

# settings.yaml から multiplexer.type を読み込む
read_multiplexer_from_settings() {
    local settings_file=".maid-agent/system/config/settings.yaml"
    if [ -f "$settings_file" ]; then
        local mux_type
        # コメント行を除外して type: の値を取得（CRLFも除去）
        mux_type=$(grep -A10 "^multiplexer:" "$settings_file" 2>/dev/null | grep -v "^[[:space:]]*#" | grep "type:" | head -1 | awk '{print $2}' | tr -d '\r')
        if [ -n "$mux_type" ] && [ "$mux_type" != "auto" ]; then
            echo "$mux_type"
            return 0
        fi
    fi
    return 1
}

get_multiplexer_command() {
    # 1. settings.yaml から読み込み
    local from_settings
    from_settings=$(read_multiplexer_from_settings)
    if [ -n "$from_settings" ]; then
        echo "$from_settings"
        return 0
    fi

    # 2. 環境変数
    if [ "${MAID_MULTIPLEXER:-}" = "psmux" ]; then
        echo "psmux"
        return 0
    fi

    # 3. 自動検出
    if [ -n "$TMUX" ]; then
        echo "tmux"
    elif command -v psmux &> /dev/null; then
        echo "psmux"
    else
        echo "tmux"
    fi
}

MUX_CMD=$(get_multiplexer_command)

# PANE変数を環境に応じて選択
if [ "$MUX_CMD" = "psmux" ]; then
    MUX_PANE="${PSMUX_PANE:-}"
else
    MUX_PANE="${TMUX_PANE:-}"
fi

# 2. マルチプレクサ環境チェック - マルチプレクサ外ならスキップ
[ -z "$TMUX" ] && [ -z "$PSMUX_PANE" ] && exit 0

# 3. window name 取得（実行中のペインのウィンドウ名を取得）
WINDOW_NAME=$($MUX_CMD display-message -p -t "$MUX_PANE" '#{window_name}' 2>/dev/null)
[ -z "$WINDOW_NAME" ] && exit 0

# 4. エージェント名一覧と照合
AGENTS="butler chief emma sophia lily rose alice may flora luna"
echo "$AGENTS" | grep -qw "$WINDOW_NAME" || exit 0

# 5. 役割判定
case "$WINDOW_NAME" in
  butler) ROLE="執事" ;;
  chief)  ROLE="メイド長" ;;
  *)      ROLE="メイド" ;;
esac

# 6. 役割別スキル参照
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

# 7. additionalContextとしてJSON出力
CONTEXT="[Maid Agent SessionStart] あなたは${ROLE}です（ID: ${WINDOW_NAME}）。"
CONTEXT="${CONTEXT} 通知: maidctl notify ${NOTIFY_TARGET} \\\"msg\\\"。"
CONTEXT="${CONTEXT} 【必須】作業開始前にシステムプロンプトを確認し、自分の役割とルールを把握すること。"
CONTEXT="${CONTEXT} 【必須】使用可能なスキルを確認し、タスク内容に必要なスキルがあれば読むこと。スキル内のresources/patterns/は推測せず必ず参照すること。"

# 8. プロジェクトルートを保存（maidctl用）
PROJECT_PATH="$CLAUDE_PROJECT_DIR"
if [ -n "$PROJECT_PATH" ]; then
  echo "$PROJECT_PATH" > ~/.maid-current-project
fi

# 9. セッションID登録（Claude Code応答表示用）
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
