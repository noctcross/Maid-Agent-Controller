#!/usr/bin/env bash
# maid-notify 送信元(SENDER)解決テスト（task-1513-1）
#
# 背景: 執事セッションからのnotifyが「unknown」と記録される事象が発生した。
# 旧実装はSENDER解決をtmux/psmuxウィンドウ名の取得のみに依存しており、tmuxサーバの
# 一時的な不調・pane再生成等でdisplay-messageが失敗すると即unknownに落ちていた。
# 一方、Claude Codeプロセス起動時にVSCode拡張がexportするCODELODIS_AGENT_ID
# （butler/chief/メイド問わず設定される）という、tmux状態に依存しない、より信頼性の
# 高い情報源が既に存在するのに未使用だった。
#
# 本テストは実際にmaid-notifyスクリプト全体をサンドボックス環境で実行し、
# ログに記録されるSENDER値を検証する（tmux/psmuxはモックコマンドで制御）。
# target（送信先）は常にオフライン状態にして送信処理自体はpendingで止め、
# SENDER解決ロジックのみを対象にする。
#
# 実行: bash project-templates/system/bin/test/maid-notify.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/../maid-notify"

pass=0
fail=0

SANDBOX="$(mktemp -d)"
cleanup() {
  rm -rf "${SANDBOX}"
}
trap cleanup EXIT

# --- サンドボックスの .maid-agent 構造を最小構築 ---
setup_sandbox() {
  rm -rf "${SANDBOX}/proj"
  mkdir -p "${SANDBOX}/proj/.maid-agent/system/config"
  mkdir -p "${SANDBOX}/proj/.maid-agent/system/data/notifications"
  echo "test-session" > "${SANDBOX}/proj/.maid-agent/system/config/.session-name"
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
if [[ "\$1" == "list-windows" ]]; then
  # check_target_online が常にオフライン判定になるよう空を返す
  exit 0
fi
if [[ "\$1" == "send-keys" ]]; then
  exit 0
fi
exit 0
EOF
  chmod +x "${SANDBOX}/mockbin/${tool}"
}

run_notify() {
  # $@ = maid-notifyへの引数。SANDBOX/proj で実行しhistory.logを検証する。
  (
    cd "${SANDBOX}/proj"
    PATH="${SANDBOX}/mockbin:${PATH}" "${SCRIPT}" "$@"
  ) >/tmp/maid_notify_out.$$ 2>&1
}

last_sender_in_log() {
  # history.log には通常行 "[TS] SENDER → TARGET: MSG" の直後に、target がオフラインの
  # 場合のみ "[TS] [PENDING] SENDER → TARGET (offline): MSG" が追記される（本テストの
  # targetは常にオフラインのためこのケースに該当）。SENDER自体は両行で同一のため、
  # 先頭に追加の "[PENDING]" 等の角括弧が付かない「通常行」の方だけを対象に抽出する。
  grep -E '^\[[^]]+\] [^[]' "${SANDBOX}/proj/.maid-agent/system/data/notifications/history.log" 2>/dev/null \
    | tail -1 \
    | sed -E 's/^\[[^]]+\] ([^ ]+) → .*/\1/'
}

echo "=== maid-notify SENDER resolution tests ==="
echo ""

# -----------------------------------------------------------------------
# 正常系1: CODELODIS_AGENT_ID=butler が設定済みの場合、tmux呼び出しに関わらず
# butlerが優先される（tmuxは正常応答するモックだが別名を返す設定にして優先度を確認）
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux tmux "some-other-window-name"
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" TMUX=1 TMUX_PANE=%1 CODELODIS_AGENT_ID=butler "${SCRIPT}" chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "butler" ]]; then
  echo "PASS: CODELODIS_AGENT_ID=butler が tmuxウィンドウ名より優先される"
  pass=$((pass + 1))
else
  echo "FAIL: CODELODIS_AGENT_ID優先のはずが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 正常系2: CODELODIS_AGENT_ID未設定・tmux正常応答時はtmuxウィンドウ名で解決される
# （旧実装からの回帰確認）
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux tmux "flora"
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" env -u CODELODIS_AGENT_ID TMUX=1 TMUX_PANE=%9 "${SCRIPT}" chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "flora" ]]; then
  echo "PASS: CODELODIS_AGENT_ID未設定時はtmuxウィンドウ名(flora)で解決される"
  pass=$((pass + 1))
else
  echo "FAIL: tmuxフォールバックのはずが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 異常系（本事故の再現）: CODELODIS_AGENT_ID未設定・tmux display-messageが
# 失敗する場合、旧実装ならunknown確定だったケース。CODELODIS_AGENT_IDが
# 設定されていれば新実装ではunknown化しないことを確認する別ケースと対比するため、
# ここではCODELODIS_AGENT_ID未設定のままtmux失敗時に正しく"unknown"へ
# フォールバックすることを確認する（フォールバック自体は維持されるべき）
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux tmux ""
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" env -u CODELODIS_AGENT_ID TMUX=1 TMUX_PANE=%1 "${SCRIPT}" chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "unknown" ]]; then
  echo "PASS: CODELODIS_AGENT_ID未設定・tmux失敗時はunknownへフォールバック（既存事故の直接原因パターンを再現・修正後も安全側フォールバックは維持）"
  pass=$((pass + 1))
else
  echo "FAIL: unknownフォールバックのはずが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 本事故の直接修正確認: CODELODIS_AGENT_ID=butler設定済み・tmux display-messageが
# 失敗するケース（実際の事故で疑われる状況）でも、butlerとして正しく解決される
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux tmux ""
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" TMUX=1 TMUX_PANE=%1 CODELODIS_AGENT_ID=butler "${SCRIPT}" chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "butler" ]]; then
  echo "PASS: ★本事故の直接修正確認: tmux display-message失敗時でもCODELODIS_AGENT_ID=butlerによりunknown化しない"
  pass=$((pass + 1))
else
  echo "FAIL: butlerとして解決されるべきが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 正常系3: --from 明示指定は最優先される（CODELODIS_AGENT_IDより優先・既存挙動の回帰確認）
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux tmux "flora"
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" TMUX=1 TMUX_PANE=%1 CODELODIS_AGENT_ID=butler "${SCRIPT}" --from master chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "master" ]]; then
  echo "PASS: --from master が CODELODIS_AGENT_ID=butler より優先される"
  pass=$((pass + 1))
else
  echo "FAIL: --from優先のはずが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

# -----------------------------------------------------------------------
# 正常系4: psmux環境ではPSMUX_PANEを使って解決される（TMUX_PANEとの不整合修正確認）
# -----------------------------------------------------------------------
setup_sandbox
setup_mock_mux psmux "rose"
if (
  cd "${SANDBOX}/proj"
  PATH="${SANDBOX}/mockbin:${PATH}" env -u TMUX -u CODELODIS_AGENT_ID MAID_MULTIPLEXER=psmux PSMUX_PANE=pane1 "${SCRIPT}" chief "test message"
) >/tmp/out.$$ 2>&1; then :; fi
actual="$(last_sender_in_log)"
if [[ "$actual" == "rose" ]]; then
  echo "PASS: psmux環境でPSMUX_PANEを使ってウィンドウ名(rose)が解決される"
  pass=$((pass + 1))
else
  echo "FAIL: psmux解決のはずが SENDER=${actual}"
  cat /tmp/out.$$ | sed 's/^/    /'
  fail=$((fail + 1))
fi
rm -f /tmp/out.$$

echo ""
echo "Results: ${pass} passed, ${fail} failed"
[[ ${fail} -eq 0 ]]
