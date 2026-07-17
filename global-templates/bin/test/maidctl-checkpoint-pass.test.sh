#!/usr/bin/env bash
# maidctl checkpoint pass テスト（task-1454-1 / C-1）
#
# 背景: Type B（通過型チェックポイント）を記録する新動詞
# `maidctl checkpoint pass --summary "..."` の実装（cmd_checkpoint_pass）を、
# 実際に配布される maidctl から関数定義のみを抽出して検証する。
# サーバー通信部分（api_request）とエージェントID自動取得
# （get_agent_id_from_multiplexer）はスタブに置き換え、CLI側の
# 引数検証・タスクID解決ロジックのみを対象とする。
# サーバー側の実際の永続化ロジック（checkpointPassAdd の配列追記）は
# packages/maid-agent-messenger/src/__tests__/services/
# task-crud-update-checkpoint-pass.test.ts で別途検証済み。
#
# 完了条件:
#   - 正常系: --summary 指定 → api_request が期待どおりの PATCH body で呼ばれる
#   - 正常系: --task 省略時、報告書(current_<agent>.md)から task_id を解決する
#   - 正常系: --task 明示時はそちらを優先する
#   - 異常系: --summary 省略 → エラー終了（EXIT_INVALID_ARGS）
#   - 異常系: --task 省略 かつ 報告書からも解決不能 → エラー終了
#
# 実行: bash global-templates/bin/test/maidctl-checkpoint-pass.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

# --- cmd_checkpoint_pass 関数定義のみを実際の maidctl から抽出 ---
CMD_FUNC_SRC="$(sed -n '/^cmd_checkpoint_pass() {/,/^}/p' "${MAIDCTL_SOURCE}")"
if [[ -z "${CMD_FUNC_SRC}" ]]; then
  echo "FAIL: cmd_checkpoint_pass 関数が ${MAIDCTL_SOURCE} に見つかりません"
  exit 1
fi

# --- サンドボックス: 報告書ディレクトリを模擬 ---
SANDBOX="$(mktemp -d)"
cleanup() {
  rm -rf "${SANDBOX}"
}
trap cleanup EXIT

REPORT_DIR="${SANDBOX}/.maid-agent/system/data/reports"
mkdir -p "${REPORT_DIR}"

write_report() {
  local agent="$1" task_id="$2"
  cat > "${REPORT_DIR}/current_${agent}.md" <<EOF
# 作業報告 - テスト

## タスク情報
- task_id: ${task_id}
- title: テストタスク
EOF
}

# --- 依存スタブ + 抽出した関数を読み込むヘルパー ---
run_cmd() {
  # $@ = cmd_checkpoint_pass への引数
  (
    EXIT_INVALID_ARGS=5
    CLAUDE_PROJECT_DIR="${SANDBOX}"

    get_agent_id_from_multiplexer() {
      [ -n "${STUB_AGENT_ID:-}" ] && { echo "${STUB_AGENT_ID}"; return 0; }
      return 1
    }

    api_request() {
      # $1=method $2=endpoint $3=data
      echo "CALLED method=$1 endpoint=$2 data=$3" >> "${SANDBOX}/api_calls.log"
      echo '{"success":true}'
    }

    eval "${CMD_FUNC_SRC}"
    cmd_checkpoint_pass "$@"
  )
}

assert_exit_ok() {
  local label="$1"; shift
  rm -f "${SANDBOX}/api_calls.log"
  local output exit_code=0
  output="$(run_cmd "$@" 2>&1)" || exit_code=$?
  if [[ ${exit_code} -eq 0 ]]; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected: exit 0"
    echo "  actual:   exit_code=${exit_code}"
    echo "${output}" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
}

assert_exit_invalid_args() {
  local label="$1"; shift
  local output exit_code=0
  output="$(run_cmd "$@" 2>&1)" || exit_code=$?
  if [[ ${exit_code} -eq 5 ]] && echo "${output}" | grep -q "エラー"; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected: exit 5 (EXIT_INVALID_ARGS) + エラーメッセージ"
    echo "  actual:   exit_code=${exit_code}"
    echo "${output}" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
}

echo "=== maidctl checkpoint pass tests ==="
echo ""

# -----------------------------------------------------------------------
# 異常系: --summary 省略 → エラー終了
# -----------------------------------------------------------------------
STUB_AGENT_ID="rose"
write_report rose "task-1454-1"
assert_exit_invalid_args "--summary 省略 → エラー終了(EXIT_INVALID_ARGS)"

# -----------------------------------------------------------------------
# 正常系: --task 省略時、報告書から task_id を解決してPATCH
# -----------------------------------------------------------------------
STUB_AGENT_ID="rose"
write_report rose "task-1454-1"
assert_exit_ok "--task 省略・報告書からtask_id解決 → 正常終了" --summary "暫定判断: dev直接で続行"

if grep -q "endpoint=/api/tasks/1454-1" "${SANDBOX}/api_calls.log" 2>/dev/null \
  && grep -q '"checkpointPassAdd"' "${SANDBOX}/api_calls.log" 2>/dev/null \
  && grep -qE '"agentId":[[:space:]]*"rose"' "${SANDBOX}/api_calls.log" 2>/dev/null; then
  echo "PASS: api_request が期待どおりのPATCH（/api/tasks/1454-1・checkpointPassAdd・agentId=rose）で呼ばれた"
  pass=$((pass + 1))
else
  echo "FAIL: api_request の呼び出し内容が期待と一致しない"
  cat "${SANDBOX}/api_calls.log" 2>/dev/null | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# 正常系: --task 明示時はそちらを優先する
# -----------------------------------------------------------------------
STUB_AGENT_ID="rose"
write_report rose "task-1454-1"
rm -f "${SANDBOX}/api_calls.log"
run_cmd --summary "明示タスク指定" --task task-9999 >/dev/null 2>&1
if grep -q "endpoint=/api/tasks/9999" "${SANDBOX}/api_calls.log" 2>/dev/null; then
  echo "PASS: --task 明示時は報告書のtask_idより優先される"
  pass=$((pass + 1))
else
  echo "FAIL: --task 明示が優先されなかった"
  cat "${SANDBOX}/api_calls.log" 2>/dev/null | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# 異常系: --task 省略 かつ 報告書が存在しない → エラー終了
# -----------------------------------------------------------------------
STUB_AGENT_ID="alice"
rm -f "${REPORT_DIR}/current_alice.md"
assert_exit_invalid_args "--task 省略・報告書なし → エラー終了(EXIT_INVALID_ARGS)" --summary "報告書なしケース"

# -----------------------------------------------------------------------
# 正常系（task-1637-9 W-CP）: --options 指定時、カンマ区切りをJSON配列に変換してPATCH
# -----------------------------------------------------------------------
STUB_AGENT_ID="rose"
write_report rose "task-1454-1"
rm -f "${SANDBOX}/api_calls.log"
assert_exit_ok "--options 指定 → 正常終了" --summary "暫定判断: A案を採用" --options "A案,B案"

if grep -q '"options"' "${SANDBOX}/api_calls.log" 2>/dev/null \
  && grep -q '"A案"' "${SANDBOX}/api_calls.log" 2>/dev/null \
  && grep -q '"B案"' "${SANDBOX}/api_calls.log" 2>/dev/null; then
  echo "PASS: --options がカンマ区切りからJSON配列に変換されPATCH bodyに含まれる"
  pass=$((pass + 1))
else
  echo "FAIL: --options がPATCH bodyのoptions配列に正しく反映されていない"
  cat "${SANDBOX}/api_calls.log" 2>/dev/null | sed 's/^/    /'
  fail=$((fail + 1))
fi

# -----------------------------------------------------------------------
# 正常系（task-1637-9 W-CP）: --options 省略時はPATCH bodyにoptionsキーを含めない
# -----------------------------------------------------------------------
STUB_AGENT_ID="rose"
write_report rose "task-1454-1"
rm -f "${SANDBOX}/api_calls.log"
run_cmd --summary "options省略ケース" >/dev/null 2>&1
if grep -q '"options"' "${SANDBOX}/api_calls.log" 2>/dev/null; then
  echo "FAIL: --options 省略時にもPATCH bodyへoptionsキーが混入している"
  cat "${SANDBOX}/api_calls.log" 2>/dev/null | sed 's/^/    /'
  fail=$((fail + 1))
else
  echo "PASS: --options 省略時はPATCH bodyにoptionsキーを含めない（後方互換）"
  pass=$((pass + 1))
fi

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
