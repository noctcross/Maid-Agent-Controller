#!/usr/bin/env bash
# json_escape 単体テスト

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIDCTL="${SCRIPT_DIR}/maidctl"
PASSED=0
FAILED=0

# テスト用の色付き出力
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1: expected '$2' but got '$3'"
    FAILED=$((FAILED + 1))
}

# maidctl から json_escape 関数を抽出してテスト用にソース
# 注: json_escape がまだ実装されていない場合、テストは失敗する
source_json_escape() {
    # json_escape 関数と依存関数（check_jq）を抽出
    if grep -q "^json_escape()" "$MAIDCTL"; then
        # 関数が存在する場合、maidctl 全体をソースして関数を利用可能にする
        # ただし main 関数の実行を防ぐため、関数定義部分のみを抽出
        eval "$(grep -A 100 "^check_jq()" "$MAIDCTL" | grep -B 100 "^# ====" | head -n -1)"
        eval "$(grep -A 20 "^json_escape()" "$MAIDCTL" | grep -B 100 "^}" | head -n 1000)"
        return 0
    else
        return 1
    fi
}

echo "=== json_escape 単体テスト ==="
echo ""

# json_escape 関数が存在するか確認
if ! source_json_escape; then
    echo -e "${YELLOW}⚠${NC} json_escape 関数がまだ実装されていません"
    echo "テストはスキップされます（TDD: RED フェーズ）"
    echo ""
    echo "期待されるテストケース:"
    echo "  1. 通常文字列: 'Hello World' → 'Hello World'"
    echo "  2. ダブルクォート: 'He said \"Hi\"' → 'He said \\\"Hi\\\"'"
    echo "  3. 改行: 'Line1<LF>Line2' → 'Line1\\nLine2'"
    echo "  4. バックスラッシュ: 'path\\to\\file' → 'path\\\\to\\\\file'"
    echo "  5. タブ: 'col1<TAB>col2' → 'col1\\tcol2'"
    echo "  6. 複合: '\"test\"<LF>next' → '\\\"test\\\"\\nnext'"
    echo "  7. 日本語: 'こんにちは' → 'こんにちは'"
    echo "  8. 絵文字: 'Hello 👋' → 'Hello 👋'"
    exit 1
fi

echo "json_escape 関数が見つかりました"
echo ""

# テスト1: 通常文字列
echo "--- テスト1: 通常文字列 ---"
input="Hello World"
expected="Hello World"
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "通常文字列がそのまま出力される"
else
    fail "通常文字列" "$expected" "$result"
fi

# テスト2: ダブルクォート
echo ""
echo "--- テスト2: ダブルクォート ---"
input='He said "Hi"'
expected='He said \"Hi\"'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "ダブルクォートがエスケープされる"
else
    fail "ダブルクォート" "$expected" "$result"
fi

# テスト3: 改行
echo ""
echo "--- テスト3: 改行 ---"
input=$'Line1\nLine2'
expected='Line1\nLine2'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "改行がエスケープされる"
else
    fail "改行" "$expected" "$result"
fi

# テスト4: バックスラッシュ
echo ""
echo "--- テスト4: バックスラッシュ ---"
input='path\to\file'
expected='path\\to\\file'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "バックスラッシュがエスケープされる"
else
    fail "バックスラッシュ" "$expected" "$result"
fi

# テスト5: タブ
echo ""
echo "--- テスト5: タブ ---"
input=$'col1\tcol2'
expected='col1\tcol2'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "タブがエスケープされる"
else
    fail "タブ" "$expected" "$result"
fi

# テスト6: 複合
echo ""
echo "--- テスト6: 複合（ダブルクォート+改行） ---"
input=$'"test"\nnext'
expected='\"test\"\nnext'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "複合文字列が正しくエスケープされる"
else
    fail "複合" "$expected" "$result"
fi

# テスト7: 日本語
echo ""
echo "--- テスト7: 日本語 ---"
input="こんにちは"
expected="こんにちは"
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "日本語がそのまま出力される"
else
    fail "日本語" "$expected" "$result"
fi

# テスト8: 絵文字
echo ""
echo "--- テスト8: 絵文字 ---"
input="Hello 👋"
expected="Hello 👋"
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "絵文字がそのまま出力される"
else
    fail "絵文字" "$expected" "$result"
fi

# テスト9: キャリッジリターン
echo ""
echo "--- テスト9: キャリッジリターン ---"
input=$'line1\rline2'
expected='line1\rline2'
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "キャリッジリターンがエスケープされる"
else
    fail "キャリッジリターン" "$expected" "$result"
fi

# テスト10: 空文字列
echo ""
echo "--- テスト10: 空文字列 ---"
input=""
expected=""
result=$(json_escape "$input")
if [ "$result" = "$expected" ]; then
    pass "空文字列が正しく処理される"
else
    fail "空文字列" "$expected" "$result"
fi

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
