#!/usr/bin/env bash
# maidctl format_my_task パーク中タスク表示テスト（task-1688-2 案B）
#
# 背景: get my-task の非JSON出力に、parked_tasks（判断待ちで一時退避されたタスク）を
# 表示する。サーバー側のレスポンス形状は
# packages/maid-agent-messenger/src/__tests__/services/get-my-task.test.ts で別途検証済み。
# 本テストは CLI 側の表示ロジックのみを検証する。
#
# 完了条件:
#   - parked_tasks がある場合 → パーク中タスクのIDを画面表示する
#   - parked_tasks がない場合 → 追加表示なし（既存出力を壊さない）
#
# 実行: bash global-templates/bin/test/maidctl-format-my-task-parked.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

FORMAT_FUNC_SRC="$(sed -n '/^format_my_task() {/,/^}/p' "${MAIDCTL_SOURCE}")"
CHECK_JQ_FUNC_SRC="$(sed -n '/^check_jq() {/,/^}/p' "${MAIDCTL_SOURCE}")"

run_format() {
  (
    eval "${CHECK_JQ_FUNC_SRC}"
    eval "${FORMAT_FUNC_SRC}"
    format_my_task "$1"
  )
}

echo "=== maidctl format_my_task parked_tasks display tests ==="
echo ""

# -----------------------------------------------------------------------
# parked_tasksがある場合、パーク中タスクIDを表示する
# -----------------------------------------------------------------------
output="$(run_format '{"task_id":"task-200","status":"assigned","description":"新タスク","parked_tasks":[{"task_id":"task-199","title":"判断待ちタスク","substatus":"checkpoint","parked_at":"2026-08-07T09:00:00Z"}]}' 2>&1)"
if echo "${output}" | grep -q "task-199"; then
  echo "PASS: parked_tasksありでパーク中タスクIDを表示した"
  pass=$((pass + 1))
else
  echo "FAIL: parked_tasksありでもパーク中タスクIDが表示されなかった"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# parked_tasksがない場合、既存出力を壊さない（回帰確認）
# -----------------------------------------------------------------------
output="$(run_format '{"task_id":"task-100","status":"working","description":"テストタスク"}' 2>&1)"
if echo "${output}" | grep -q "Task ID: task-100"; then
  echo "PASS: parked_tasksなしでも既存出力は維持される"
  pass=$((pass + 1))
else
  echo "FAIL: 既存出力が壊れた"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
fi
if echo "${output}" | grep -qi "パーク"; then
  echo "FAIL: parked_tasksなしなのにパーク表示が出た"
  fail=$((fail + 1))
else
  echo "PASS: parked_tasksなしでパーク表示は出ない"
  pass=$((pass + 1))
fi

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
