#!/usr/bin/env bash
# maidctl task assign 警告表示テスト（task-1461-6 Q-5-3）
#
# 背景: subtask-creation-rule.md の機械強制化として、サーバー側（assign-task.ts）が
# 「前タスクID流用」が疑われる場合（既に completed のタスクへの再アサイン等）に
# warning フィールドを返すようにした。本テストは cmd_task_assign が
# レスポンスの warning フィールドを検知し、非JSON出力時に画面表示することを検証する
# （サーバー側の warning 生成ロジック自体は
# packages/maid-agent-messenger/src/__tests__/services/assign-task.test.ts で別途検証済み）。
#
# 完了条件:
#   - 正常系: レスポンスに warning あり → 非JSON出力時に画面（stderr）へ warning を表示する
#   - 正常系: レスポンスに warning なし → 追加表示なし
#
# 実行: bash global-templates/bin/test/maidctl-assign-task-warning.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

# --- cmd_task_assign 関数定義のみを実際の maidctl から抽出 ---
CMD_FUNC_SRC="$(sed -n '/^cmd_task_assign() {/,/^}/p' "${MAIDCTL_SOURCE}")"
if [[ -z "${CMD_FUNC_SRC}" ]]; then
  echo "FAIL: cmd_task_assign 関数が ${MAIDCTL_SOURCE} に見つかりません"
  exit 1
fi

CHECK_JQ_FUNC_SRC="$(sed -n '/^check_jq() {/,/^}/p' "${MAIDCTL_SOURCE}")"

# --- api_request をスタブに置き換えて実行するヘルパー ---
run_cmd() {
  # $1 = api_request が返す JSON レスポンス（スタブ）
  # $2以降 = cmd_task_assign への引数
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
    cmd_task_assign "$@"
  )
}

echo "=== maidctl task assign warning display tests ==="
echo ""

# -----------------------------------------------------------------------
# 正常系: warning ありのレスポンス → 画面(stderr)へ warning を表示する
# -----------------------------------------------------------------------
output="$(run_cmd '{"success":true,"assignedTask":{"task_id":"100","assigned_to":"emma"},"warning":"タスク #100 は既に completed です。前タスクIDの流用ではないか確認してください。"}' task-100 --to emma 2>&1)"
if echo "${output}" | grep -q "流用"; then
  echo "PASS: warning ありレスポンス → 画面にwarningを表示した"
  pass=$((pass + 1))
else
  echo "FAIL: warning ありレスポンスでも画面に表示されなかった"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# 正常系: warning なしのレスポンス → 追加表示なし
# -----------------------------------------------------------------------
output="$(run_cmd '{"success":true,"assignedTask":{"task_id":"100","assigned_to":"emma"}}' task-100 --to emma 2>&1)"
if echo "${output}" | grep -q "流用\|⚠️"; then
  echo "FAIL: warning なしレスポンスなのに何か警告表示があった"
  echo "${output}" | sed 's/^/    /'
  fail=$((fail + 1))
else
  echo "PASS: warning なしレスポンス → 追加表示なし"
  pass=$((pass + 1))
fi

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
