#!/usr/bin/env bash
# sync-project-settings.sh - project-templates/settings.yaml を実体に安全に同期する
# ★ 全上書き（cp）の代わりに必ずこのスクリプトを使用すること
#
# 動作:
#   1. 実体から「プロジェクト固有設定」（PRESERVED_TOP_KEYS）を退避
#   2. テンプレートの内容（batch_chunk 等のシステム設定）を実体に反映
#   3. 退避した固有設定を復元
#
# 保護対象（実体のみに存在する可能性があるキー）:
#   model    - LLMモデル設定（執事がプロジェクトに応じて設定）
#   provider - LLMプロバイダ設定（AWS Bedrock 等）
#
# 使い方:
#   bash sync-project-settings.sh <template.yaml> <target.yaml>
#   bash sync-project-settings.sh <template.yaml> <target.yaml> --dry-run
#
# 例:
#   bash project-templates/system/bin/sync-project-settings.sh \
#        project-templates/system/config/settings.yaml \
#        .maid-agent/system/config/settings.yaml

set -euo pipefail

TEMPLATE="${1:-}"
TARGET="${2:-}"
DRY_RUN="${3:-}"

PRESERVED_TOP_KEYS=(model provider)

# =============================================================================
# 引数チェック
# =============================================================================

if [ -z "$TEMPLATE" ] || [ -z "$TARGET" ]; then
    cat >&2 <<EOF
使用法: $0 <template-settings.yaml> <target-settings.yaml> [--dry-run]

  template: project-templates/system/config/settings.yaml
  target:   .maid-agent/system/config/settings.yaml
  --dry-run: 実際には変更せず、マージ結果を標準出力に表示

保護対象キー: ${PRESERVED_TOP_KEYS[*]}
EOF
    exit 1
fi

[ -f "$TEMPLATE" ] || { echo "エラー: テンプレートが見つかりません: $TEMPLATE" >&2; exit 1; }
[ -f "$TARGET" ]   || { echo "エラー: 実体が見つかりません: $TARGET" >&2; exit 1; }

# python3 + PyYAML の存在確認
if ! python3 -c "import yaml" 2>/dev/null; then
    echo "エラー: python3-yaml が必要です" >&2
    echo "  インストール: pip3 install pyyaml  または  sudo apt install python3-yaml" >&2
    exit 1
fi

# =============================================================================
# YAML マージ処理
# =============================================================================

MERGED=$(python3 - "$TEMPLATE" "$TARGET" "${PRESERVED_TOP_KEYS[@]}" <<'PYTHON'
import yaml
import sys

template_path = sys.argv[1]
target_path = sys.argv[2]
preserved_keys = sys.argv[3:]

def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

template = load_yaml(template_path)
target = load_yaml(target_path)

# テンプレートをベースに、保護キーは実体の値を優先（Noneでなければ）
merged = dict(template)
actually_preserved = []
for key in preserved_keys:
    if key in target and target[key] is not None:
        merged[key] = target[key]
        actually_preserved.append(key)

# 結果を標準出力に YAML で出力
print(yaml.dump(merged, allow_unicode=True, default_flow_style=False,
                sort_keys=False, indent=2).rstrip())

# 保護したキーをログに出力（stderr）
import sys as _sys
if actually_preserved:
    print(f"  保護したキー: {', '.join(actually_preserved)}", file=_sys.stderr)
else:
    print("  保護したキー: なし（実体に固有設定なし）", file=_sys.stderr)
PYTHON
)

# =============================================================================
# dry-run または実際の書き込み
# =============================================================================

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "=== [DRY RUN] マージ結果（実体には書き込みません） ==="
    echo "$MERGED"
    echo "=== [DRY RUN] 終了 ==="
    exit 0
fi

# バックアップ作成
BACKUP="${TARGET}.$(date +%Y%m%d_%H%M%S).backup"
cp "$TARGET" "$BACKUP"
echo "バックアップ: $BACKUP"

# 書き込み
echo "$MERGED" > "$TARGET"
echo "✅ 同期完了: $TARGET"
echo "   テンプレート: $TEMPLATE"
echo "   ★ 全上書き(cp)でなくこのスクリプトで同期したため固有設定は保持されています"
