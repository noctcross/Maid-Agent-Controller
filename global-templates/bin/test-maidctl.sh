#!/usr/bin/env bash
# maidctl 統合テスト

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL="${SCRIPT_DIR}/maidctl"
PASSED=0
FAILED=0

# テスト用の色付き出力
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

echo "=== maidctl 統合テスト ==="
echo ""

# 1. ファイル存在確認
echo "--- 1. ファイル存在確認 ---"
if [ -f "$MAIDCTL" ]; then
    pass "maidctl が存在する"
else
    fail "maidctl が見つからない"
fi

if [ -x "$MAIDCTL" ]; then
    pass "maidctl に実行権限がある"
else
    fail "maidctl に実行権限がない"
fi

# 2. ヘルプ表示
echo ""
echo "--- 2. ヘルプ表示 ---"
if "$MAIDCTL" --help 2>&1 | grep -q "maidctl - Maid Agent CLI Tool"; then
    pass "--help が正常に動作"
else
    fail "--help が失敗"
fi

if "$MAIDCTL" --version 2>&1 | grep -q "maidctl version"; then
    pass "--version が正常に動作"
else
    fail "--version が失敗"
fi

# 3. サブコマンドヘルプ
echo ""
echo "--- 3. サブコマンドヘルプ ---"
if "$MAIDCTL" task list --help 2>&1 | grep -q "使用法: maidctl task list"; then
    pass "task list --help が正常"
else
    fail "task list --help が失敗"
fi

if "$MAIDCTL" my-task --help 2>&1 | grep -q "使用法: maidctl my-task"; then
    pass "my-task --help が正常"
else
    fail "my-task --help が失敗"
fi

if "$MAIDCTL" my-status --help 2>&1 | grep -q "使用法: maidctl my-status"; then
    pass "my-status --help が正常"
else
    fail "my-status --help が失敗"
fi

if "$MAIDCTL" team status --help 2>&1 | grep -q "使用法: maidctl team status"; then
    pass "team status --help が正常"
else
    fail "team status --help が失敗"
fi

# 4. バリデーション（エラー終了するコマンドのテスト）
echo ""
echo "--- 4. バリデーション ---"
set +e  # エラー終了を一時無効化
output=$("$MAIDCTL" my-task invalid_agent 2>&1)
if echo "$output" | grep -q "無効なエージェント"; then
    pass "無効なエージェントIDを正しく検出"
else
    fail "無効なエージェントID検出に失敗"
fi

output=$("$MAIDCTL" my-status emma invalid_status 2>&1)
if echo "$output" | grep -q "無効なステータス"; then
    pass "無効なステータスを正しく検出"
else
    fail "無効なステータス検出に失敗"
fi

# 5. 不明なコマンド
echo ""
echo "--- 5. 不明なコマンド処理 ---"
output=$("$MAIDCTL" unknown_command 2>&1)
if echo "$output" | grep -q "不明なコマンド"; then
    pass "不明なコマンドを正しく検出"
else
    fail "不明なコマンド検出に失敗"
fi

output=$("$MAIDCTL" task unknown_sub 2>&1)
if echo "$output" | grep -q "不明なサブコマンド"; then
    pass "不明なサブコマンドを正しく検出"
else
    fail "不明なサブコマンド検出に失敗"
fi

# 6. プロジェクトルート外での実行
echo ""
echo "--- 6. プロジェクトルート検出 ---"
cd /tmp
output=$("$MAIDCTL" task list 2>&1)
if echo "$output" | grep -q ".maid-agent ディレクトリが見つかりません"; then
    pass "プロジェクトルート外でエラーを検出"
else
    fail "プロジェクトルート外でのエラー検出に失敗"
fi
cd - > /dev/null
set -e  # エラー終了を再有効化

# 結果サマリ
echo ""
echo "=== テスト結果 ==="
echo -e "成功: ${GREEN}${PASSED}${NC}"
echo -e "失敗: ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}全テスト成功！${NC}"
    exit 0
else
    echo -e "${RED}一部テストが失敗${NC}"
    exit 1
fi
