#!/usr/bin/env bash
# maidctl resume-parked-task テスト（task-1688-2 案B）
#
# 背景: パーク中タスクの再開はチーフ専用の明示的操作。優先順位のブレを防止するため
# 自動昇格は行わず、本コマンドを呼んだときのみ再開が発生する（サーバー側ロジックは
# packages/maid-agent-messenger/src/__tests__/services/resume-parked-task.test.ts で
# 別途検証済み）。本テストは CLI 側の引数処理・レスポンスハンドリングのみを検証する。
#
# 完了条件:
#   - 正常系: TASK_ID 指定 + --agent 指定 → 成功メッセージを表示
#   - 異常系: サービスがエラーを返す → エラーメッセージを表示し非ゼロ終了
#   - 異常系: TASK_ID 未指定 → エラー終了
#   - 異常系: --agent 未指定 → エラー終了
#
# 実行: bash global-templates/bin/test/maidctl-resume-parked-task.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

CMD_FUNC_SRC="$(sed -n '/^cmd_resume_parked_task() {/,/^}/p' "${MAIDCTL_SOURCE}")"
if [[ -z "${CMD_FUNC_SRC}" ]]; then
  echo "FAIL: cmd_resume_parked_task 関数が ${MAIDCTL_SOURCE} に見つかりません"
  exit 1
fi

CHECK_JQ_FUNC_SRC="$(sed -n '/^check_jq() {/,/^}/p' "${MAIDCTL_SOURCE}")"

run_cmd() {
  # $1 = api_request が返す JSON レスポンス（スタブ）
  # $2以降 = cmd_resume_parked_task への引数
  local stub_response="$1"; shift
  (
    EXIT_INVALID_ARGS=5
    VALID_AGENTS="emma sophia lily rose alice may flora luna"

    api_request() {
      echo "${STUB_RESPONSE}"
    }

    STUB_RESPONSE="${stub_response}"

    eval "${CHECK_JQ_FUNC_SRC}"
    eval "${CMD_FUNC_SRC}"
    cmd_resume_parked_task "$@"
  )
}

echo "=== maidctl resume-parked-task tests ==="
echo ""

# -----------------------------------------------------------------------
# 正常系: 成功レスポンス → 再開したタスクIDを画面表示
# -----------------------------------------------------------------------
output="$(run_cmd '{"success":true,"agent_id":"emma","task_id":"task-199"}' task-199 --agent emma 2>&1)"
if echo "${output}" | grep -q "task-199"; then
  echo "PASS: 正常系 → 再開したタスクIDを表示した"
  pass=$((pass + 1))
else
  echo "FAIL: 正常系レスポンスでもタスクIDが表示されなかった"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# 異常系: サービスがエラーを返す → エラーメッセージを表示し非ゼロ終了
# -----------------------------------------------------------------------
if output="$(run_cmd '{"success":false,"error":"見つかりません"}' task-999 --agent emma 2>&1)"; then
  echo "FAIL: サービスエラー時にゼロ終了してしまった"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
else
  if echo "${output}" | grep -q "見つかりません"; then
    echo "PASS: サービスエラー時にエラーメッセージを表示し非ゼロ終了した"
    pass=$((pass + 1))
  else
    echo "FAIL: サービスエラー時にエラーメッセージが表示されなかった"
    echo "${output}" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
fi

# -----------------------------------------------------------------------
# 異常系: TASK_ID未指定 → エラー終了
# -----------------------------------------------------------------------
if output="$(run_cmd '{}' --agent emma 2>&1)"; then
  echo "FAIL: TASK_ID未指定でもゼロ終了してしまった"
  fail=$((fail + 1))
else
  echo "PASS: TASK_ID未指定でエラー終了した"
  pass=$((pass + 1))
fi

# -----------------------------------------------------------------------
# 異常系: --agent未指定 → エラー終了
# -----------------------------------------------------------------------
if output="$(run_cmd '{}' task-199 2>&1)"; then
  echo "FAIL: --agent未指定でもゼロ終了してしまった"
  fail=$((fail + 1))
else
  echo "PASS: --agent未指定でエラー終了した"
  pass=$((pass + 1))
fi

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
