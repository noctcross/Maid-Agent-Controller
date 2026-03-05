#!/bin/bash
# =============================================================================
# quality-check.sh - 報告書品質チェックスクリプト
#
# 使用法: quality-check.sh <report_file> [task_type]
#
# 引数:
#   report_file - チェック対象の報告書ファイルパス
#   task_type   - タスク種別 (task/work/step/investigation) 省略時は step
#
# 終了コード:
#   0 - 品質チェック合格
#   1 - 引数エラー
#   2 - 品質チェック失敗（差し戻し）
# =============================================================================

set -e

REPORT_FILE="${1:-}"
TASK_TYPE="${2:-step}"
ERRORS=""
WARNINGS=""

# 設定
MAX_RETRY_COUNT=5
HISTORY_DIR="${CLAUDE_PROJECT_DIR:-.}/.maid-agent/system/data/quality-history"

# =============================================================================
# ユーティリティ関数
# =============================================================================

log_error() {
  ERRORS+="- $1\n"
}

log_warning() {
  WARNINGS+="- $1\n"
}

check_section_exists() {
  local section="$1"
  local label="$2"
  if ! grep -q "^## $section" "$REPORT_FILE" 2>/dev/null; then
    log_error "$label セクションがありません"
    return 1
  fi
  return 0
}

check_section_not_empty() {
  local section="$1"
  local label="$2"
  local min_lines="${3:-2}"

  # セクションの内容を抽出（次の ## までまたはファイル終端まで）
  local content
  content=$(sed -n "/^## $section/,/^## /p" "$REPORT_FILE" 2>/dev/null | \
            grep -v "^## " | grep -v "^$" | grep -v "^<!--" | wc -l)

  if [ "$content" -lt "$min_lines" ]; then
    log_error "$label の内容が空または不十分です"
    return 1
  fi
  return 0
}

check_yaml_field() {
  local field="$1"
  local label="$2"

  # YAML フィールドが存在し、値が設定されているか確認
  if ! grep -q "^${field}:" "$REPORT_FILE" 2>/dev/null; then
    log_error "$label が記載されていません"
    return 1
  fi
  return 0
}

# =============================================================================
# 引数チェック
# =============================================================================

if [ -z "$REPORT_FILE" ]; then
  echo "使用法: quality-check.sh <report_file> [task_type]" >&2
  exit 1
fi

if [ ! -f "$REPORT_FILE" ]; then
  echo "エラー: ファイルが見つかりません: $REPORT_FILE" >&2
  exit 1
fi

# =============================================================================
# 基本形式チェック（全タスク共通）
# =============================================================================

# タスク情報セクション
check_section_exists "タスク情報" "タスク情報"

# 作業内容セクション
check_section_exists "作業内容" "作業内容"
check_section_not_empty "作業内容" "作業内容"

# エスカレーション判断
check_section_exists "エスカレーション" "エスカレーション"
if ! grep -q "escalation:" "$REPORT_FILE" 2>/dev/null; then
  log_error "エスカレーション判断（escalation:）が記載されていません"
fi

# 切り出し確認
check_section_exists "切り出し確認" "切り出し確認"
if ! grep -q "extraction_check:" "$REPORT_FILE" 2>/dev/null; then
  log_error "切り出し確認（extraction_check:）が記載されていません"
fi

# スキル化候補
check_section_exists "スキル化候補" "スキル化候補"
if ! grep -q "skill_candidate:" "$REPORT_FILE" 2>/dev/null; then
  log_error "スキル化候補判断（skill_candidate:）が記載されていません"
fi

# 改善提案
check_section_exists "改善提案" "改善提案"
if ! grep -q "improvement_proposal:" "$REPORT_FILE" 2>/dev/null; then
  log_error "改善提案判断（improvement_proposal:）が記載されていません"
fi

# =============================================================================
# タスク種別ごとの追加チェック
# =============================================================================

case "$TASK_TYPE" in
  work|step)
    # 変更ファイル記載チェック
    check_section_exists "変更ファイル" "変更ファイル"

    # 変更ファイルの内容が空でないかチェック（work/step のみ必須）
    local_content=$(sed -n "/^## 変更ファイル/,/^## /p" "$REPORT_FILE" 2>/dev/null | \
                    grep -v "^## " | grep -v "^$" | wc -l)
    if [ "$local_content" -lt 1 ]; then
      log_error "変更ファイルが記載されていません（実装タスクでは必須）"
    fi
    ;;

  investigation)
    # 調査結果の記載確認
    # 作業内容セクションが十分な長さか（調査タスクは詳細が必要）
    local_content=$(sed -n "/^## 作業内容/,/^## /p" "$REPORT_FILE" 2>/dev/null | \
                    grep -v "^## " | grep -v "^$" | grep -v "^<!--" | wc -l)
    if [ "$local_content" -lt 5 ]; then
      log_warning "調査結果の記載が少ないようです（詳細な調査結果を記載してください）"
    fi
    ;;

  task)
    # 親タスクは基本形式のみ（追加チェックなし）
    ;;
esac

# =============================================================================
# 結果出力
# =============================================================================

# 履歴ディレクトリ作成
mkdir -p "$HISTORY_DIR" 2>/dev/null || true

# エージェントIDとタスクIDを抽出（履歴記録用）
AGENT_ID=$(basename "$REPORT_FILE" .md | sed 's/current_//')
TASK_ID=$(grep -m1 "task_id:" "$REPORT_FILE" 2>/dev/null | sed 's/.*task_id: *//' | tr -d ' ')

# 履歴ファイルパス
HISTORY_FILE="$HISTORY_DIR/${AGENT_ID}_${TASK_ID}.log"

# タイムスタンプ
TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)

if [ -n "$ERRORS" ]; then
  # 品質チェック失敗
  echo "品質チェック失敗:" >&2
  echo -e "$ERRORS" >&2

  if [ -n "$WARNINGS" ]; then
    echo "" >&2
    echo "警告:" >&2
    echo -e "$WARNINGS" >&2
  fi

  echo "" >&2
  echo "報告書を修正して、再度完了報告を行ってください。" >&2

  # 履歴記録
  echo "$TIMESTAMP FAIL $(echo -e "$ERRORS" | tr '\n' ' ')" >> "$HISTORY_FILE" 2>/dev/null || true

  exit 2
fi

# 品質チェック合格
if [ -n "$WARNINGS" ]; then
  echo "品質チェック合格（警告あり）:" >&2
  echo -e "$WARNINGS" >&2
else
  echo "品質チェック合格" >&2
fi

# 履歴記録
echo "$TIMESTAMP PASS" >> "$HISTORY_FILE" 2>/dev/null || true

exit 0
