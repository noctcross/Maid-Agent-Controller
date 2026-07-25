#!/usr/bin/env bash
# maidctl detect_linked_worktree_root テスト（task-1641-1）
#
# 背景: quality_check() 内のLLM品質チェックが、git worktree運用時に
# worktreeではなく主working tree（メインリポジトリ）を参照して成果物評価を行い、
# 「未実装」「report矛盾」の誤ったcritical判定を出す問題（task-1641改善提案）を修正する。
# 本テストは、実際に quality_check() が使用する worktree検出ロジック
# （detect_linked_worktree_root）を、実際に配布される maidctl から関数定義のみを
# 抽出し、実物のgitリポジトリ・worktreeに対して検証する。
#
# quality-check-llm.sh / maid-agent-messenger APIへの worktreePath 伝播ロジックは
# packages/maid-agent-messenger/src/services/__tests__/quality-service-worktree.test.ts
# で別途検証済み。
#
# 完了条件:
#   - git管理外ディレクトリ → 空文字（worktree_rootなし）
#   - 主working tree（通常のgitリポジトリ/clone） → 空文字（linked worktreeではない）
#   - linked worktree（git worktree add で作成） → worktreeの絶対パスを返す
#
# 実行: bash global-templates/bin/test/maidctl-detect-linked-worktree.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL_SOURCE="${SCRIPT_DIR}/../maidctl"

pass=0
fail=0

# --- detect_linked_worktree_root 関数定義のみを実際の maidctl から抽出 ---
FUNC_SRC="$(sed -n '/^detect_linked_worktree_root() {/,/^}/p' "${MAIDCTL_SOURCE}")"
if [[ -z "${FUNC_SRC}" ]]; then
  echo "FAIL: detect_linked_worktree_root 関数が ${MAIDCTL_SOURCE} に見つかりません"
  exit 1
fi

SANDBOX="$(mktemp -d)"
cleanup() {
  rm -rf "${SANDBOX}"
}
trap cleanup EXIT

run_in_dir() {
  local dir="$1"
  (
    cd "${dir}" || exit 1
    eval "${FUNC_SRC}"
    detect_linked_worktree_root
  )
}

assert_empty() {
  local label="$1" dir="$2"
  local output
  output="$(run_in_dir "${dir}")"
  if [[ -z "${output}" ]]; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected: (空文字)"
    echo "  actual:   ${output}"
    fail=$((fail + 1))
  fi
}

assert_equals() {
  local label="$1" expected="$2" dir="$3"
  local output
  output="$(run_in_dir "${dir}")"
  if [[ "${output}" == "${expected}" ]]; then
    echo "PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "FAIL: ${label}"
    echo "  expected: ${expected}"
    echo "  actual:   ${output}"
    fail=$((fail + 1))
  fi
}

echo "=== maidctl detect_linked_worktree_root tests ==="
echo ""

# -----------------------------------------------------------------------
# git管理外ディレクトリ → 空文字
# -----------------------------------------------------------------------
NON_GIT_DIR="${SANDBOX}/non-git"
mkdir -p "${NON_GIT_DIR}"
assert_empty "git管理外ディレクトリ → worktree_rootなし（空文字）" "${NON_GIT_DIR}"

# -----------------------------------------------------------------------
# 主working tree（通常のgitリポジトリ） → 空文字（linked worktreeではない）
# -----------------------------------------------------------------------
MAIN_REPO="${SANDBOX}/main-repo"
mkdir -p "${MAIN_REPO}"
git -C "${MAIN_REPO}" init -q -b dev
git -C "${MAIN_REPO}" config user.name "test"
git -C "${MAIN_REPO}" config user.email "test@example.com"
echo "hello" > "${MAIN_REPO}/file.txt"
git -C "${MAIN_REPO}" add file.txt
git -C "${MAIN_REPO}" commit -q -m "init"
assert_empty "主working tree（通常clone） → worktree_rootなし（空文字）" "${MAIN_REPO}"

# -----------------------------------------------------------------------
# linked worktree（git worktree add で作成） → worktreeの絶対パスを返す
# -----------------------------------------------------------------------
LINKED_WT="${SANDBOX}/linked-worktree"
git -C "${MAIN_REPO}" worktree add -q -b feature/test-branch "${LINKED_WT}" dev >/dev/null 2>&1
EXPECTED_WT_PATH="$(cd "${LINKED_WT}" && pwd)"
assert_equals "linked worktree → worktreeの絶対パスを返す" "${EXPECTED_WT_PATH}" "${LINKED_WT}"

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
