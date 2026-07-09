#!/usr/bin/env bash
# === Maid Agent SessionStart Hook ===
# エージェント名解決 + エージェント名一致時のみコンテキスト注入・session_id登録。
# 通常のClaude Code利用（tmux/psmux外かつCODELODIS_AGENT_ID未設定）には影響しない。
#
# エージェント名の解決優先順位（task-1522-1: claude agents起動＝TMUX_PANE/PSMUX_PANE
# 未設定でもCODELODIS_AGENT_IDは設定される環境でsession_id登録が空振りしていた問題の修正。
# task-1513-1のmaid-notify SENDER解決と同じ優先順位に揃えている）:
#   1. CODELODIS_AGENT_ID環境変数（Claude Codeプロセス起動時にVSCode拡張がexportする値。
#      tmux/psmux不問で設定されるため、claude agents起動経路でも取得できる）
#   2. tmux/psmuxウィンドウ名（従来方式・マルチプレクサ環境でのみ機能）
# どちらでも解決できなければ通常のClaude Code利用とみなしスキップする。

# 0. stdinからJSONを読み取り（session_id取得用）
STDIN_JSON=$(cat)
SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)

AGENTS="butler chief emma sophia lily rose alice may flora luna"

# 1. マルチプレクサ環境検出（CODELODIS_AGENT_ID未設定時のフォールバック用）

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

# 2. エージェント名（WINDOW_NAME）解決
if [ -n "${CODELODIS_AGENT_ID:-}" ]; then
    # tmux/psmux不問で取得できる、より信頼性の高い情報源を優先
    WINDOW_NAME="$CODELODIS_AGENT_ID"
else
    # マルチプレクサ外ならスキップ（CODELODIS_AGENT_IDもtmux/psmuxもない＝通常のClaude Code利用）
    [ -z "$TMUX" ] && [ -z "$PSMUX_PANE" ] && exit 0

    MUX_CMD=$(get_multiplexer_command)

    # PANE変数を環境に応じて選択
    if [ "$MUX_CMD" = "psmux" ]; then
        MUX_PANE="${PSMUX_PANE:-}"
    else
        MUX_PANE="${TMUX_PANE:-}"
    fi

    # window name 取得（実行中のペインのウィンドウ名を取得）
    WINDOW_NAME=$($MUX_CMD display-message -p -t "$MUX_PANE" '#{window_name}' 2>/dev/null)
fi

[ -z "$WINDOW_NAME" ] && exit 0

# 3. エージェント名一覧と照合
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
