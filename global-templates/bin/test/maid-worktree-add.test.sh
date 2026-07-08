#!/usr/bin/env bash
# maid-worktree-add 名義解決テスト（task-1512-1）
#
# 背景: floraがmaid-worktree-add実行時にworktree名義がbutlerに誤判定される事故が
# 発生した。根本原因は2点:
#   (1) 実際にexportされる環境変数はCODELODIS_AGENT_IDだが、旧実装は
#       MAID_AGENT_IDのみを見ていたため常にこの段が失敗しtmuxフォールバックへ落ちていた
#   (2) tmuxフォールバックが `tmux display-message -p '#{window_name}'` を
#       ペイン指定なしで呼んでおり、tmuxクライアントの「現在アクティブな
#       ウィンドウ」名を返してしまう（自分のペインの所属ウィンドウとは限らない）
#
# 本テストは一時git repoに対して実際にmaid-worktree-addを実行し、
# 環境変数の解決順序とフェイルセーフ（予約語検知・未解決時のエラー停止）を検証する。
# tmuxフォールバック自体（実環境のtmuxセッション状態に依存するため）は対象外とし、
# 別途実機検証済み（報告書参照）。
#
# 実行: bash global-templates/bin/test/maid-worktree-add.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/../maid-worktree-add"

pass=0
fail=0

SANDBOX="$(mktemp -d)"
cleanup() {
  rm -rf "${SANDBOX}"
}
trap cleanup EXIT

REPO="${SANDBOX}/repo"
mkdir -p "${REPO}"
(
  cd "${REPO}"
  git init -q
  git config user.name "sandbox"
  git config user.email "sandbox@test.local"
  echo "init" > README.md
  git add README.md
  git commit -q -m "init"
)

wt_counter=0
# ★next_wt_pathは呼び出し側で `next_wt_path; wt="$CURRENT_WT"` のようにコマンド置換すると
#  サブシェルでカウンタが増分され親シェルに反映されない（bashの既知の挙動）。
#  そのため必ず `next_wt_path` を直接呼びグローバル変数 CURRENT_WT を更新する形にする。
next_wt_path() {
  wt_counter=$((wt_counter + 1))
  CURRENT_WT="${SANDBOX}/wt${wt_counter}"
}

echo "=== maid-worktree-add tests ==="
echo ""

# -----------------------------------------------------------------------
# 正常系: CODELODIS_AGENT_ID が設定されていれば正しく名義解決される
# （旧実装はMAID_AGENT_IDしか見ておらず、この変数では解決できなかった）
# -----------------------------------------------------------------------
next_wt_path; wt="$CURRENT_WT"
if (
  cd "${REPO}"
  env -u TMUX -u MAID_AGENT_ID CODELODIS_AGENT_ID=rose "${SCRIPT}" -b "test-branch-$(basename "$wt")" "$wt"
) >/tmp/out.$$ 2>&1; then
  actual_name="$(cd "$wt" && git config --worktree user.name 2>/dev/null || true)"
  actual_email="$(cd "$wt" && git config --worktree user.email 2>/dev/null || true)"
  if [[ "$actual_name" == "rose" ]] && [[ "$actual_email" == "rose@maid-agent.local" ]]; then
    echo "PASS: CODELODIS_AGENT_ID=rose → worktree名義がrose/rose@maid-agent.localに設定される"
    pass=$((pass + 1))
  else
    echo "FAIL: CODELODIS_AGENT_ID=rose → 名義が期待と一致しない (name=${actual_name} email=${actual_email})"
    fail=$((fail + 1))
  fi
else
  echo "FAIL: CODELODIS_AGENT_ID=rose → 正常終了するはずが失敗した"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 正常系: --maid-id 明示指定が最優先される（env変数より優先）
# -----------------------------------------------------------------------
next_wt_path; wt="$CURRENT_WT"
if (
  cd "${REPO}"
  env -u TMUX CODELODIS_AGENT_ID=rose "${SCRIPT}" --maid-id lily -b "test-branch-$(basename "$wt")" "$wt"
) >/tmp/out.$$ 2>&1; then
  actual_name="$(cd "$wt" && git config --worktree user.name 2>/dev/null || true)"
  if [[ "$actual_name" == "lily" ]]; then
    echo "PASS: --maid-id lily が CODELODIS_AGENT_ID=rose より優先される"
    pass=$((pass + 1))
  else
    echo "FAIL: --maid-id の優先度が期待と異なる (name=${actual_name})"
    fail=$((fail + 1))
  fi
else
  echo "FAIL: --maid-id lily → 正常終了するはずが失敗した"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 異常系（フェイルセーフ1）: 予約済み識別子(butler)が解決された場合はエラー停止し、
# worktreeを作成しない
# -----------------------------------------------------------------------
next_wt_path; wt="$CURRENT_WT"
exit_code=0
(
  cd "${REPO}"
  env -u TMUX -u MAID_AGENT_ID -u CODELODIS_AGENT_ID "${SCRIPT}" --maid-id butler -b "test-branch-$(basename "$wt")" "$wt"
) >/tmp/out.$$ 2>&1 || exit_code=$?
if [[ ${exit_code} -eq 1 ]] && ! [[ -d "$wt" ]] && grep -q "予約済み識別子" /tmp/out.$$; then
  echo "PASS: --maid-id butler → エラー停止(exit 1)・worktree未作成・エラーメッセージあり"
  pass=$((pass + 1))
else
  echo "FAIL: --maid-id butler → 期待した失敗挙動と異なる (exit_code=${exit_code}, wt_exists=$([[ -d "$wt" ]] && echo yes || echo no))"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 異常系（フェイルセーフ2）: 全ての解決手段が未設定の場合はエラー停止し、
# worktreeを作成しない
# -----------------------------------------------------------------------
next_wt_path; wt="$CURRENT_WT"
exit_code=0
(
  cd "${REPO}"
  git config --global --unset maid.defaultAgent 2>/dev/null || true
  env -u TMUX -u MAID_AGENT_ID -u CODELODIS_AGENT_ID "${SCRIPT}" -b "test-branch-$(basename "$wt")" "$wt"
) >/tmp/out.$$ 2>&1 || exit_code=$?
if [[ ${exit_code} -eq 1 ]] && ! [[ -d "$wt" ]] && grep -q "メイドIDを特定できませんでした" /tmp/out.$$; then
  echo "PASS: 全解決手段未設定 → エラー停止(exit 1)・worktree未作成・エラーメッセージあり"
  pass=$((pass + 1))
else
  echo "FAIL: 全解決手段未設定 → 期待した失敗挙動と異なる (exit_code=${exit_code}, wt_exists=$([[ -d "$wt" ]] && echo yes || echo no))"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 異常系: --maid-id に空文字を渡した場合はエラー（既存挙動の回帰確認）
# -----------------------------------------------------------------------
exit_code=0
(
  cd "${REPO}"
  "${SCRIPT}" --maid-id
) >/tmp/out.$$ 2>&1 || exit_code=$?
if [[ ${exit_code} -eq 1 ]] && grep -q "メイドIDを指定してください" /tmp/out.$$; then
  echo "PASS: --maid-id に値なし → エラー停止(exit 1)"
  pass=$((pass + 1))
else
  echo "FAIL: --maid-id に値なし → 期待した失敗挙動と異なる (exit_code=${exit_code})"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# worktreeのクリーンアップ（次のテスト実行への影響を避ける）
# -----------------------------------------------------------------------
(
  cd "${REPO}"
  for i in $(seq 1 "$wt_counter"); do
    git worktree remove "${SANDBOX}/wt${i}" --force 2>/dev/null || true
  done
) >/dev/null 2>&1 || true

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
