#!/bin/bash
# =============================================================================
# quality-check-llm.sh - LLMによる報告書品質チェック
#
# 使用法: quality-check-llm.sh <report_file> <task_type> [project_root]
#
# 引数:
#   report_file  - チェック対象の報告書ファイルパス
#   task_type    - タスク種別 (investigation/work/step/task)
#   project_root - プロジェクトルート（省略時: CLAUDE_PROJECT_DIR または pwd）
#
# 終了コード:
#   0 - チェック合格または警告のみ
#   1 - チェック失敗（on_failure: block の場合）
# =============================================================================

set -euo pipefail

# =============================================================================
# 引数処理
# =============================================================================

REPORT_FILE="${1:-}"
TASK_TYPE="${2:-step}"
PROJECT_ROOT="${3:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"

# パス定義
CONFIG_FILE="$PROJECT_ROOT/.maid-agent/system/config/settings.yaml"
PROMPTS_DIR="$PROJECT_ROOT/.maid-agent/system/config/quality-prompts"
HISTORY_DIR="$PROJECT_ROOT/.maid-agent/system/data/quality-history"

# =============================================================================
# 設定読み込み
# =============================================================================

load_config() {
  # デフォルト値
  LLM_ENABLED="true"
  LLM_MODEL="haiku"
  LLM_ON_FAILURE="warn"
  LLM_TIMEOUT="60"
  LLM_SCORE_THRESHOLD="60"
  LLM_DEBUG="false"
  LLM_TASK_TYPES="investigation design proposal document work step review"

  if [ ! -f "$CONFIG_FILE" ]; then
    return
  fi

  # yq で設定読み込み（yq がない場合はデフォルト値を使用）
  if command -v yq &>/dev/null; then
    LLM_ENABLED=$(yq -r '.quality_check.llm_check.enabled // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
    LLM_MODEL=$(yq -r '.quality_check.llm_check.model // "haiku"' "$CONFIG_FILE" 2>/dev/null || echo "haiku")
    LLM_ON_FAILURE=$(yq -r '.quality_check.llm_check.on_failure // "warn"' "$CONFIG_FILE" 2>/dev/null || echo "warn")
    LLM_TIMEOUT=$(yq -r '.quality_check.llm_check.timeout // 60' "$CONFIG_FILE" 2>/dev/null || echo "60")
    LLM_SCORE_THRESHOLD=$(yq -r '.quality_check.llm_check.score_threshold // 60' "$CONFIG_FILE" 2>/dev/null || echo "60")
    LLM_DEBUG=$(yq -r '.quality_check.llm_check.advanced.debug // false' "$CONFIG_FILE" 2>/dev/null || echo "false")
    LLM_TASK_TYPES=$(yq -r '.quality_check.llm_check.task_types[]' "$CONFIG_FILE" 2>/dev/null | tr '\n' ' ' || echo "investigation work")
  fi
}

debug_log() {
  if [ "$LLM_DEBUG" = "true" ]; then
    echo "[DEBUG] $*" >&2
  fi
}

# =============================================================================
# タスク種別チェック
# =============================================================================

is_target_task_type() {
  echo "$LLM_TASK_TYPES" | grep -qw "$TASK_TYPE"
}

# =============================================================================
# JSON Schema 定義
# =============================================================================

QUALITY_SCHEMA='{
  "type": "object",
  "properties": {
    "pass": {
      "type": "boolean",
      "description": "品質チェック合格かどうか"
    },
    "score": {
      "type": "number",
      "description": "品質スコア（0-100）"
    },
    "issues": {
      "type": "array",
      "items": { "type": "string" },
      "description": "検出された問題点"
    },
    "suggestions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "改善提案"
    }
  },
  "required": ["pass", "score", "issues"]
}'

# =============================================================================
# プロンプト選択
# =============================================================================

get_prompt() {
  local prompt_file="$PROMPTS_DIR/${TASK_TYPE}.txt"

  # タスク種別ごとのフォールバック
  if [ ! -f "$prompt_file" ]; then
    case "$TASK_TYPE" in
      design|proposal|review|task)
        # 調査・分析系はinvestigation.txtにフォールバック
        prompt_file="$PROMPTS_DIR/investigation.txt"
        ;;
      document|step|*)
        # 実装・作成系はwork.txtにフォールバック
        prompt_file="$PROMPTS_DIR/work.txt"
        ;;
    esac
  fi

  if [ ! -f "$prompt_file" ]; then
    echo ""
    return 1
  fi

  cat "$prompt_file"
}

# =============================================================================
# LLMチェック実行（API経由）
# =============================================================================

run_llm_check() {
  local report_content task_id_val agent_id
  report_content=$(cat "$REPORT_FILE")
  task_id_val=$(grep -m1 "task_id:" "$REPORT_FILE" 2>/dev/null | sed 's/.*task_id: *//' | tr -d ' ')
  agent_id=$(basename "$REPORT_FILE" .md | sed 's/current_//')

  debug_log "TaskId: $task_id_val"
  debug_log "Model: $LLM_MODEL"

  # maid-agent-messenger API経由でLLMチェック実行
  local server_url="${MAID_SERVER_URL:-http://localhost:3100}"

  # JSONペイロード構築（jqがある場合）
  local payload
  if command -v jq &>/dev/null; then
    # timeout を秒からミリ秒に変換（APIはミリ秒を期待）
    local timeout_ms=$((LLM_TIMEOUT * 1000))
    payload=$(jq -cn \
      --arg tid "$task_id_val" \
      --arg tt "$TASK_TYPE" \
      --arg rc "$report_content" \
      --arg aid "$agent_id" \
      --arg mdl "$LLM_MODEL" \
      --argjson to "$timeout_ms" \
      '{taskId:$tid,taskType:$tt,reportContent:$rc,agentId:$aid,options:{model:$mdl,timeout:$to}}')
  else
    # jqがない場合は簡易的なJSON（reportContentのエスケープが不完全な可能性あり）
    echo "警告: jqがインストールされていません。正確なJSON構築ができない可能性があります。" >&2
    payload="{\"taskId\":\"$task_id_val\",\"taskType\":\"$TASK_TYPE\",\"reportContent\":\"\",\"agentId\":\"$agent_id\"}"
  fi

  debug_log "API URL: $server_url/api/quality/llm-check"

  # API呼び出し
  local response
  response=$(timeout "${LLM_TIMEOUT}s" curl -s -X POST "$server_url/api/quality/llm-check" \
    -H "Content-Type: application/json" \
    -H "X-Maid-Project-Path: $PROJECT_ROOT" \
    -d "$payload" 2>/dev/null) || {
    echo "警告: LLM品質チェックAPIの呼び出しに失敗しました（タイムアウトまたは接続エラー）" >&2
    return 0  # 失敗時は警告のみで続行
  }

  debug_log "API Response: $response"

  # APIレスポンス解析
  local success skipped
  success=$(echo "$response" | jq -r '.success // false' 2>/dev/null || echo "false")
  skipped=$(echo "$response" | jq -r '.skipped // false' 2>/dev/null || echo "false")

  if [ "$success" != "true" ]; then
    local error_msg
    error_msg=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Unknown error")
    echo "警告: LLM品質チェックAPIエラー: $error_msg" >&2
    return 0
  fi

  if [ "$skipped" = "true" ]; then
    local skip_reason
    skip_reason=$(echo "$response" | jq -r '.skipReason // "Unknown"' 2>/dev/null || echo "Unknown")
    echo "LLMチェックはスキップされました: $skip_reason"
    return 0
  fi

  # 結果を抽出（APIレスポンスのresultフィールド）
  echo "$response" | jq -c '.result // {}' 2>/dev/null || echo "{}"
}

# =============================================================================
# 結果解析
# =============================================================================

parse_result() {
  local result="$1"

  # JSON 解析
  local pass score issues_count
  pass=$(echo "$result" | jq -r '.pass // false' 2>/dev/null || echo "false")
  score=$(echo "$result" | jq -r '.score // 0' 2>/dev/null || echo "0")
  issues_count=$(echo "$result" | jq -r '.issues | length' 2>/dev/null || echo "0")

  debug_log "Pass: $pass, Score: $score, Issues: $issues_count"

  # スコア閾値チェック
  if [ "$pass" = "true" ] && [ "$score" -lt "$LLM_SCORE_THRESHOLD" ] 2>/dev/null; then
    pass="false"
    debug_log "Score $score is below threshold $LLM_SCORE_THRESHOLD"
  fi

  if [ "$pass" = "true" ]; then
    echo "LLM品質チェック合格（スコア: $score）"
    return 0
  else
    echo "LLM品質チェック失敗（スコア: $score / 閾値: $LLM_SCORE_THRESHOLD）:" >&2
    echo "" >&2
    echo "【問題点】" >&2
    echo "$result" | jq -r '.issues[]' 2>/dev/null | while read -r issue; do
      echo "- $issue" >&2
    done
    echo "" >&2
    echo "【改善提案】" >&2
    echo "$result" | jq -r '.suggestions[]' 2>/dev/null | while read -r sug; do
      echo "- $sug" >&2
    done

    if [ "$LLM_ON_FAILURE" = "block" ]; then
      return 1
    else
      echo "" >&2
      echo "（on_failure: warn のため、タスク完了は許可されます）" >&2
      return 0
    fi
  fi
}

# =============================================================================
# 履歴記録
# =============================================================================

record_history() {
  local result="$1"
  local status="$2"
  local check_type="${3:-llm}"

  mkdir -p "$HISTORY_DIR/logs" 2>/dev/null || true

  local timestamp agent score issues_json task_id_val
  timestamp=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
  agent=$(basename "$REPORT_FILE" .md | sed 's/current_//')
  task_id_val=$(grep -m1 "task_id:" "$REPORT_FILE" 2>/dev/null | sed 's/.*task_id: *//' | tr -d ' ')

  if [ "$check_type" = "llm" ]; then
    score=$(echo "$result" | jq -r '.score // null' 2>/dev/null || echo "null")
    issues_json=$(echo "$result" | jq -c '.issues // []' 2>/dev/null || echo "[]")
  else
    score="null"
    issues_json="[]"
  fi

  # 月別ファイルに追記（JSON Lines形式）
  local log_file="$HISTORY_DIR/logs/$(date +%Y-%m).jsonl"
  local log_entry

  # jq がある場合はJSONを正しく構築
  if command -v jq &>/dev/null; then
    log_entry=$(jq -cn \
      --arg ts "$timestamp" \
      --arg tid "$task_id_val" \
      --arg tt "$TASK_TYPE" \
      --arg ag "$agent" \
      --arg ct "$check_type" \
      --arg rs "$status" \
      --argjson sc "${score:-null}" \
      --argjson is "$issues_json" \
      --arg md "${LLM_MODEL:-haiku}" \
      '{timestamp:$ts,task_id:$tid,task_type:$tt,agent:$ag,check_type:$ct,result:$rs,score:$sc,issues:$is,model:$md}')
  else
    # jq がない場合は簡易的なJSON
    log_entry="{\"timestamp\":\"$timestamp\",\"task_id\":\"$task_id_val\",\"task_type\":\"$TASK_TYPE\",\"agent\":\"$agent\",\"check_type\":\"$check_type\",\"result\":\"$status\",\"score\":$score,\"model\":\"${LLM_MODEL:-haiku}\"}"
  fi

  echo "$log_entry" >> "$log_file" 2>/dev/null || true

  # 旧形式との互換性のため、レガシーログも出力
  mkdir -p "$HISTORY_DIR/legacy" 2>/dev/null || true
  local legacy_file="$HISTORY_DIR/legacy/${agent}_${task_id_val}_llm.log"
  echo "$timestamp $status score=$score model=${LLM_MODEL:-haiku}" >> "$legacy_file" 2>/dev/null || true
}

# =============================================================================
# メイン処理
# =============================================================================

main() {
  # 引数チェック
  if [ -z "$REPORT_FILE" ]; then
    echo "使用法: quality-check-llm.sh <report_file> <task_type> [project_root]" >&2
    exit 1
  fi

  if [ ! -f "$REPORT_FILE" ]; then
    echo "エラー: ファイルが見つかりません: $REPORT_FILE" >&2
    exit 1
  fi

  # 設定読み込み
  load_config

  debug_log "LLM_ENABLED=$LLM_ENABLED"
  debug_log "TASK_TYPE=$TASK_TYPE"
  debug_log "LLM_TASK_TYPES=$LLM_TASK_TYPES"

  # LLMチェック無効の場合
  if [ "$LLM_ENABLED" != "true" ]; then
    echo "LLMチェックは無効です（llm_check.enabled: false）"
    exit 0
  fi

  # 対象タスク種別でない場合（ローカルでの事前チェック）
  # ※ API側でも同様のチェックを行うが、不要なAPIコールを避けるためローカルでも確認
  if ! is_target_task_type; then
    echo "LLMチェックはスキップ（タスク種別 '$TASK_TYPE' は対象外）"
    exit 0
  fi

  # LLMチェック実行（API経由）
  # ※ プロンプト読み込み・LLM呼び出しはAPI側で実行
  echo "LLM品質チェックを実行中...（モデル: $LLM_MODEL）"
  local result
  result=$(run_llm_check)

  if [ -z "$result" ]; then
    echo "警告: LLMからの応答がありませんでした" >&2
    exit 0
  fi

  # 結果解析
  if parse_result "$result"; then
    record_history "$result" "PASS"
    exit 0
  else
    record_history "$result" "FAIL"
    exit 1
  fi
}

main "$@"
