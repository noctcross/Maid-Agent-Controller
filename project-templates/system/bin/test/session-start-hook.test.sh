#!/usr/bin/env bash
# session-start-hook.sh エージェント名解決・session_id自動登録テスト（task-1522-1）
#
# 背景: claude agents（バックグラウンドジョブ）起動経路ではTMUX_PANE/PSMUX_PANEが
# 未設定になる。旧実装はマルチプレクサ環境チェックで即exit 0していたため、
# session_id登録（maid/{agent}.yaml書き込み）がこの起動経路では常に空振りし、
# response-api-routes.tsが古い/存在しないsession_idを参照し続けモバイル同期が
# 停止していた（親task-1522）。
#
# task-1513-1（maid-notify SENDER解決）と同じ優先順位（CODELODIS_AGENT_ID優先→
# tmux/psmuxフォールバック）をsession-start-hook.shにも適用した修正を検証する。
#
# 本テストは実際にsession-start-hook.shをサンドボックス環境で実行し、
# maid/{agent}.yamlへのsession_id書き込み結果を検証する（tmux/psmuxはモックコマンドで制御）。
# ~/.maid-current-project への書き込み副作用はHOME環境変数をサンドボックスへ向けて隔離する。
#
# 実行: bash project-templates/system/bin/test/session-start-hook.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/../session-start-hook.sh"

pass=0
fail=0

SANDBOX="$(mktemp -d)"
cleanup() {
  rm -rf "${SANDBOX}"
}
trap cleanup EXIT

# --- サンドボックスの .maid-agent 構造を最小構築 ---
# $1=エージェントID（maid/{id}.yamlを作成する。省略時はluna）
setup_sandbox() {
  local agent_id="${1:-luna}"
  rm -rf "${SANDBOX}/proj" "${SANDBOX}/home"
  mkdir -p "${SANDBOX}/proj/.maid-agent/system/config"
  mkdir -p "${SANDBOX}/proj/.maid-agent/system/data/maid"
  mkdir -p "${SANDBOX}/home"
  cat > "${SANDBOX}/proj/.maid-agent/system/data/maid/${agent_id}.yaml" <<EOF
id: ${agent_id}
role: maid
EOF
}

# --- モックtmux/psmuxをPATH先頭に配置 ---
# $1=ツール名(tmux|psmux) $2=display-message実行時に返す値（空なら失敗させる）
setup_mock_mux() {
  local tool="$1" ret_value="$2"
  mkdir -p "${SANDBOX}/mockbin"
  cat > "${SANDBOX}/mockbin/${tool}" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "display-message" ]]; then
  if [[ -n "${ret_value}" ]]; then
    echo "${ret_value}"
    exit 0
  else
    exit 1
  fi
fi
exit 0
EOF
  chmod +x "${SANDBOX}/mockbin/${tool}"
}

# --- jqがなければモックする（サンドボックス環境にjqがない場合の保険） ---
ensure_jq_available() {
  if ! command -v jq &> /dev/null; then
    echo "SKIP: jqコマンドが見つからないため全テストをスキップします" >&2
    exit 0
  fi
}

# $1=stdinに渡すsession_id $2..=env設定込みのコマンド呼び出し用（run_hook内で組み立て）
# CLAUDE_PROJECT_DIR/HOME/PATHは全呼び出し共通のためここで固定する
run_hook() {
  local session_id="$1"
  shift
  (
    cd "${SANDBOX}/proj"
    CLAUDE_PROJECT_DIR="${SANDBOX}/proj" HOME="${SANDBOX}/home" PATH="${SANDBOX}/mockbin:${PATH}" "$@" bash "${SCRIPT}"
  ) < <(echo "{\"session_id\": \"${session_id}\"}") >/tmp/session_start_out.$$ 2>&1
}

session_id_in_yaml() {
  local agent_id="$1"
  grep "^session_id:" "${SANDBOX}/proj/.maid-agent/system/data/maid/${agent_id}.yaml" 2>/dev/null \
    | sed -E 's/^session_id:[[:space:]]*//'
}

ensure_jq_available

echo "=== session-start-hook.sh エージェント名解決・session_id登録テスト ==="
echo ""

# -----------------------------------------------------------------------
# ★本事故の直接修正確認: claude agents起動を模したケース
# （TMUX/PSMUX_PANE両方未設定・CODELODIS_AGENT_ID=lunaのみ設定）でも
# session_idがmaid/luna.yamlへ正しく登録されることを確認
# -----------------------------------------------------------------------
setup_sandbox "luna"
if run_hook "sess-claude-agents-001" env -u TMUX -u PSMUX_PANE CODELODIS_AGENT_ID=luna; then :; fi
actual="$(session_id_in_yaml luna)"
if [[ "$actual" == "sess-claude-agents-001" ]]; then
  echo "PASS: ★claude agents起動（TMUX/PSMUX_PANE未設定・CODELODIS_AGENT_ID=luna）でもsession_idが登録される"
  pass=$((pass + 1))
else
  echo "FAIL: session_idが登録されるはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 正常系1: CODELODIS_AGENT_ID未設定・tmux正常応答時は従来通りウィンドウ名で
# 解決されsession_idが登録される（旧実装からの回帰確認）
# -----------------------------------------------------------------------
setup_sandbox "flora"
setup_mock_mux tmux "flora"
if run_hook "sess-tmux-002" env -u CODELODIS_AGENT_ID TMUX=1 TMUX_PANE=%9; then :; fi
actual="$(session_id_in_yaml flora)"
if [[ "$actual" == "sess-tmux-002" ]]; then
  echo "PASS: CODELODIS_AGENT_ID未設定時はtmuxウィンドウ名(flora)で解決されsession_id登録される"
  pass=$((pass + 1))
else
  echo "FAIL: tmuxフォールバックで登録されるはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 正常系2: CODELODIS_AGENT_ID=butlerが設定済みの場合、tmuxが正常応答でも
# CODELODIS_AGENT_IDが優先される（tmuxモックは別名を返す設定にして優先度を確認）
# -----------------------------------------------------------------------
setup_sandbox "butler"
setup_mock_mux tmux "some-other-window-name"
if run_hook "sess-priority-003" env TMUX=1 TMUX_PANE=%1 CODELODIS_AGENT_ID=butler; then :; fi
actual="$(session_id_in_yaml butler)"
if [[ "$actual" == "sess-priority-003" ]]; then
  echo "PASS: CODELODIS_AGENT_ID=butler がtmuxウィンドウ名より優先される"
  pass=$((pass + 1))
else
  echo "FAIL: CODELODIS_AGENT_ID優先で登録されるはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 正常系3: マルチプレクサ外・CODELODIS_AGENT_IDも未設定（通常のClaude Code利用）
# の場合はexit 0でスキップし、session_idは登録されない（既存挙動の維持確認）
# -----------------------------------------------------------------------
setup_sandbox "luna"
if run_hook "sess-normal-004" env -u TMUX -u PSMUX_PANE -u CODELODIS_AGENT_ID; then :; fi
actual="$(session_id_in_yaml luna)"
if [[ -z "$actual" ]]; then
  echo "PASS: マルチプレクサ外かつCODELODIS_AGENT_ID未設定時はsession_id未登録のまま（通常利用への非干渉を維持）"
  pass=$((pass + 1))
else
  echo "FAIL: session_id未登録のはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 異常系: CODELODIS_AGENT_IDがエージェント名一覧に存在しない値の場合、
# 一致しないためスキップされsession_idは登録されない
# -----------------------------------------------------------------------
setup_sandbox "luna"
if run_hook "sess-unknown-005" env -u TMUX -u PSMUX_PANE CODELODIS_AGENT_ID=not-a-real-agent; then :; fi
actual="$(session_id_in_yaml luna)"
if [[ -z "$actual" ]]; then
  echo "PASS: 未知のCODELODIS_AGENT_ID値はエージェント一覧と不一致のためスキップされる"
  pass=$((pass + 1))
else
  echo "FAIL: session_id未登録のはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 正常系4: 既存session_idの上書き確認（claude agents再起動でsession_idが
# 更新されるケース。親task-1522の完了条件そのもの）
# -----------------------------------------------------------------------
setup_sandbox "luna"
echo "session_id: old-session-999" >> "${SANDBOX}/proj/.maid-agent/system/data/maid/luna.yaml"
if run_hook "sess-updated-006" env -u TMUX -u PSMUX_PANE CODELODIS_AGENT_ID=luna; then :; fi
actual="$(session_id_in_yaml luna)"
if [[ "$actual" == "sess-updated-006" ]]; then
  echo "PASS: 既存session_idが新しいセッションIDへ正しく上書きされる（claude agents再起動時の更新確認）"
  pass=$((pass + 1))
else
  echo "FAIL: session_idが上書きされるはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

# -----------------------------------------------------------------------
# 正常系5: psmux環境・CODELODIS_AGENT_ID未設定時はPSMUX_PANEを使って
# 解決される（従来方式の回帰確認）
# -----------------------------------------------------------------------
setup_sandbox "rose"
setup_mock_mux psmux "rose"
if run_hook "sess-psmux-007" env -u TMUX -u CODELODIS_AGENT_ID MAID_MULTIPLEXER=psmux PSMUX_PANE=pane1; then :; fi
actual="$(session_id_in_yaml rose)"
if [[ "$actual" == "sess-psmux-007" ]]; then
  echo "PASS: psmux環境でPSMUX_PANEを使ってウィンドウ名(rose)が解決されsession_id登録される"
  pass=$((pass + 1))
else
  echo "FAIL: psmux解決で登録されるはずが actual='${actual}'"
  cat /tmp/session_start_out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/session_start_out.$$

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
