#!/usr/bin/env bash
# maidctl task list --action-required / 未知オプションエラー化テスト（task-1495-1）
#
# 背景: task-1494-3(may)の改善提案の実装。cmd_task_list は --status/--assignee/--parent/
# --limit/--summary/--json のみ対応しており、actionRequired（🚨要対応フラグ）での絞り込み
# 手段が無く、未知オプション（例: 存在しない --step-required）を指定してもサイレントに
# 無視され「フィルタなし全件」が返っていた（実害: 執事がstepRequired 52件という誤った
# 棚卸し結果を掴んだ）。本テストは以下2点を検証する:
#   (1) --action-required 指定時、api_request に actionRequired=true クエリが渡る
#   (2) 未知オプション指定時、cmd_task_get/set task と同様にエラー終了する
#     （api_request が一度も呼ばれないこと＝フィルタなし全件取得を防止）
#
# 完了条件:
#   - 正常系: --action-required → クエリに actionRequired=true が含まれる
#   - 正常系: --action-required 省略時はクエリに actionRequired が含まれない（既存挙動維持）
#   - 正常系: 既存オプション（--status 等）との併用でも actionRequired=true が含まれる
#   - 異常系: 未知オプション（例: --step-required）→ エラー終了(EXIT_INVALID_ARGS) かつ
#     api_request が呼ばれない
#
# 実行: bash global-templates/bin/test/maidctl-task-list-action-required.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

# --- cmd_task_list 関数定義のみを実際の maidctl から抽出 ---
CMD_FUNC_SRC="$(sed -n '/^cmd_task_list() {/,/^}/p' "${MAIDCTL_SOURCE}")"
if [[ -z "${CMD_FUNC_SRC}" ]]; then
  echo "FAIL: cmd_task_list 関数が ${MAIDCTL_SOURCE} に見つかりません"
  exit 1
fi

# --- 依存スタブ + 抽出した関数を読み込むヘルパー ---
CALL_LOG=""
run_cmd() {
  # $@ = cmd_task_list への引数
  (
    EXIT_INVALID_ARGS=5
    CALL_LOG_FILE="${CALL_LOG}"

    api_request() {
      # $1=method $2=endpoint
      echo "CALLED method=$1 endpoint=$2" >> "${CALL_LOG_FILE}"
      echo '{"tasks":[],"total":0,"hasMore":false}'
    }

    format_task_list() {
      echo "FORMATTED"
    }

    eval "${CMD_FUNC_SRC}"
    cmd_task_list "$@"
  )
}

setup_log() {
  CALL_LOG="$(mktemp)"
}

assert_query_contains() {
  local label="$1" needle="$2"; shift 2
  setup_log
  run_cmd "$@" >/dev/null 2>&1
  if grep -q "${needle}" "${CALL_LOG}"; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected query to contain: ${needle}"
    echo "  actual call log:"
    cat "${CALL_LOG}" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
  rm -f "${CALL_LOG}"
}

assert_query_not_contains() {
  local label="$1" needle="$2"; shift 2
  setup_log
  run_cmd "$@" >/dev/null 2>&1
  if grep -q "${needle}" "${CALL_LOG}"; then
    echo "FAIL: ${label}"
    echo "  expected query NOT to contain: ${needle}"
    echo "  actual call log:"
    cat "${CALL_LOG}" | sed 's/^/    /'
    fail=$((fail + 1))
  else
    echo "PASS: ${label}"
    pass=$((pass + 1))
  fi
  rm -f "${CALL_LOG}"
}

assert_unknown_option_errors() {
  local label="$1"; shift
  setup_log
  local output exit_code=0
  output="$(run_cmd "$@" 2>&1)" || exit_code=$?
  local api_called="no"
  [[ -s "${CALL_LOG}" ]] && api_called="yes"
  if [[ ${exit_code} -eq 5 ]] && echo "${output}" | grep -q "エラー" && [[ "${api_called}" == "no" ]]; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected: exit 5 (EXIT_INVALID_ARGS) + エラーメッセージ + api_request未呼び出し"
    echo "  actual:   exit_code=${exit_code} api_called=${api_called}"
    echo "${output}" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
  rm -f "${CALL_LOG}"
}

echo "=== maidctl task list --action-required / 未知オプションエラー化テスト ==="
echo ""

# -----------------------------------------------------------------------
# 正常系: --action-required 指定 → actionRequired=true がクエリに含まれる
# -----------------------------------------------------------------------
assert_query_contains "--action-required 指定 → actionRequired=trueがクエリに含まれる" \
  "endpoint=/api/tasks?actionRequired=true" --action-required --json

# -----------------------------------------------------------------------
# 正常系: --action-required 省略時は actionRequired がクエリに含まれない（既存挙動維持）
# -----------------------------------------------------------------------
assert_query_not_contains "--action-required 省略時はactionRequiredを含まない" \
  "actionRequired" --status completed --json

# -----------------------------------------------------------------------
# 正常系: 既存オプションとの併用でも actionRequired=true が含まれる
# -----------------------------------------------------------------------
assert_query_contains "--status との併用でも actionRequired=true が含まれる" \
  "actionRequired=true" --status completed --action-required --json

# -----------------------------------------------------------------------
# 異常系: 未知オプション → エラー終了・api_request未呼び出し（サイレント無視の再発防止）
# -----------------------------------------------------------------------
assert_unknown_option_errors "未知オプション --step-required → エラー終了・全件取得を防止" \
  --step-required --summary

assert_unknown_option_errors "未知オプション --foo → エラー終了" \
  --foo bar

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
