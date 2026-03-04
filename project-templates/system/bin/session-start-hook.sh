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
CONTEXT="${CONTEXT} 【必須】使用可能なスキルを確認し、タスク内容に必要なスキルがあれば読むこと。スキル内のresources/patterns/は推測せず必ず参照すること。"

# 7. セッションID登録（Claude Code応答表示用）
PROJECT_PATH="$CLAUDE_PROJECT_DIR"
if [ -n "$PROJECT_PATH" ]; then
  # プロジェクトパスをClaude形式に変換（/と_を-に置換）
  CLAUDE_PROJECT_ID=$(echo "$PROJECT_PATH" | sed 's|^/||; s|[/_]|-|g')
  CLAUDE_SESSIONS_DIR="$HOME/.claude/projects/-${CLAUDE_PROJECT_ID}"

  if [ -d "$CLAUDE_SESSIONS_DIR" ]; then
    SESSION_ID=""

    # エージェントIDから日本語名パターンを生成（起動メッセージ用）
    case "$WINDOW_NAME" in
      butler) AGENT_PATTERN="執事のシルヴィア" ;;
      chief)  AGENT_PATTERN="メイド長のビオラ" ;;
      emma)   AGENT_PATTERN="メイドのエマ" ;;
      sophia) AGENT_PATTERN="メイドのソフィア" ;;
      lily)   AGENT_PATTERN="メイドのリリー" ;;
      rose)   AGENT_PATTERN="メイドのローズ" ;;
      alice)  AGENT_PATTERN="メイドのアリス" ;;
      may)    AGENT_PATTERN="メイドのメイ" ;;
      flora)  AGENT_PATTERN="メイドのフローラ" ;;
      luna)   AGENT_PATTERN="メイドのルナ" ;;
      *)      AGENT_PATTERN="" ;;
    esac

    # 方法1: jsonlの起動メッセージから自分のセッションを特定
    # 直近2分以内に更新されたjsonlを対象に、日本語名または「ID: {WINDOW_NAME}」を含むものを探す
    for jsonl in $(find "$CLAUDE_SESSIONS_DIR" -name "*.jsonl" -mmin -2 2>/dev/null); do
      # 最初の20行で検索（日本語名 or ID: {WINDOW_NAME}）
      if [ -n "$AGENT_PATTERN" ] && head -20 "$jsonl" 2>/dev/null | grep -q "$AGENT_PATTERN"; then
        SESSION_ID=$(basename "$jsonl" .jsonl)
        break
      elif head -20 "$jsonl" 2>/dev/null | grep -q "ID: ${WINDOW_NAME}"; then
        SESSION_ID=$(basename "$jsonl" .jsonl)
        break
      fi
    done

    # 方法2: フォールバック - 見つからなければ最新のjsonlを使用
    if [ -z "$SESSION_ID" ]; then
      SESSION_ID=$(ls -t "$CLAUDE_SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1 | xargs -I {} basename {} .jsonl)
    fi

    if [ -n "$SESSION_ID" ]; then
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
