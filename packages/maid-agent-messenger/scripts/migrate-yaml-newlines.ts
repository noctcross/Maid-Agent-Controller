#!/usr/bin/env npx tsx
/**
 * YAML 改行エスケープ問題のマイグレーションスクリプト
 *
 * tasks.yaml および maid yaml 内の \\n（リテラル2文字）を
 * 実際の改行文字に変換し、リテラルブロック形式で再出力する。
 *
 * @see docs/plans/task-219-1-yaml-newline-fix.md
 *
 * 使用方法:
 *   npx tsx scripts/migrate-yaml-newlines.ts [--dry-run] [--project-path <path>]
 *
 * オプション:
 *   --dry-run       実際のファイル更新を行わず、変更内容を表示
 *   --project-path  プロジェクトパス（デフォルト: カレントディレクトリ）
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

// stringifyYaml をインポート（ビルド後のパスを参照）
// Note: このスクリプトは tsx で直接実行されるため、相対パスでソースを参照
import { stringifyYaml } from "../src/utils/yaml-helper.js";

interface MigrationResult {
  file: string;
  changed: boolean;
  fieldsUpdated: string[];
  error?: string;
}

/**
 * 文字列内の \\n（リテラル2文字）を実際の改行に変換
 * ただしコードブロック内（``` で囲まれた部分）は除外
 */
function convertEscapedNewlines(text: string): string {
  if (!text || typeof text !== "string") return text;

  // コードブロック内は変換しない
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => {
      // 奇数インデックスはコードブロック（正規表現のキャプチャグループ）
      if (index % 2 === 1) return part;
      // コードブロック外のみ \\n を \n に変換
      return part.replace(/\\n/g, "\n");
    })
    .join("");
}

/**
 * オブジェクト内のすべての文字列フィールドを再帰的に変換
 */
function convertObjectNewlines(
  obj: unknown,
  parentPath = ""
): { data: unknown; updatedFields: string[] } {
  const updatedFields: string[] = [];

  if (obj === null || obj === undefined) {
    return { data: obj, updatedFields };
  }

  if (typeof obj === "string") {
    const converted = convertEscapedNewlines(obj);
    if (converted !== obj) {
      updatedFields.push(parentPath || "root");
    }
    return { data: converted, updatedFields };
  }

  if (Array.isArray(obj)) {
    const newArr = obj.map((item, index) => {
      const result = convertObjectNewlines(item, `${parentPath}[${index}]`);
      updatedFields.push(...result.updatedFields);
      return result.data;
    });
    return { data: newArr, updatedFields };
  }

  if (typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = parentPath ? `${parentPath}.${key}` : key;
      const result = convertObjectNewlines(value, fieldPath);
      newObj[key] = result.data;
      updatedFields.push(...result.updatedFields);
    }
    return { data: newObj, updatedFields };
  }

  return { data: obj, updatedFields };
}

/**
 * 単一のYAMLファイルをマイグレーション
 */
async function migrateYamlFile(
  filePath: string,
  dryRun: boolean
): Promise<MigrationResult> {
  const result: MigrationResult = {
    file: filePath,
    changed: false,
    fieldsUpdated: [],
  };

  try {
    // ファイル読み込み
    const content = await fs.readFile(filePath, "utf-8");
    const data = yaml.parse(content);

    // 変換実行
    const { data: convertedData, updatedFields } = convertObjectNewlines(data);
    result.fieldsUpdated = updatedFields;

    if (updatedFields.length > 0) {
      result.changed = true;

      if (!dryRun) {
        // バックアップ作成
        const backupPath = `${filePath}.bak`;
        await fs.writeFile(backupPath, content, "utf-8");

        // 新形式で出力
        const newContent = stringifyYaml(convertedData);
        await fs.writeFile(filePath, newContent, "utf-8");
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  let projectPath = process.cwd();
  const projectPathIndex = args.indexOf("--project-path");
  if (projectPathIndex !== -1 && args[projectPathIndex + 1]) {
    projectPath = args[projectPathIndex + 1];
  }

  console.log("=== YAML 改行エスケープ マイグレーション ===");
  console.log(`プロジェクトパス: ${projectPath}`);
  console.log(`モード: ${dryRun ? "ドライラン（変更なし）" : "本番実行"}`);
  console.log("");

  // マイグレーション対象ファイルを収集
  const targetFiles: string[] = [];

  // 1. tasks.yaml
  const tasksYamlPath = path.join(
    projectPath,
    ".maid-agent",
    "system",
    "data",
    "tasks.yaml"
  );
  try {
    await fs.access(tasksYamlPath);
    targetFiles.push(tasksYamlPath);
  } catch {
    console.log("⚠️  tasks.yaml が見つかりません");
  }

  // 2. maid yaml（各メイドの .yaml）
  const maidDir = path.join(projectPath, ".maid-agent", "system", "data", "maid");
  try {
    const maidFiles = await fs.readdir(maidDir);
    for (const file of maidFiles) {
      if (file.endsWith(".yaml")) {
        targetFiles.push(path.join(maidDir, file));
      }
    }
  } catch {
    console.log("⚠️  maid ディレクトリが見つかりません");
  }

  console.log(`対象ファイル: ${targetFiles.length} 件`);
  console.log("");

  // マイグレーション実行
  const results: MigrationResult[] = [];
  for (const file of targetFiles) {
    const relativePath = path.relative(projectPath, file);
    process.stdout.write(`処理中: ${relativePath}...`);
    const result = await migrateYamlFile(file, dryRun);
    results.push(result);

    if (result.error) {
      console.log(` ❌ エラー: ${result.error}`);
    } else if (result.changed) {
      console.log(` ✅ ${result.fieldsUpdated.length} フィールド更新`);
    } else {
      console.log(" ⏭️  変更なし");
    }
  }

  // サマリー出力
  console.log("");
  console.log("=== サマリー ===");
  const changedCount = results.filter((r) => r.changed).length;
  const errorCount = results.filter((r) => r.error).length;
  console.log(`変更あり: ${changedCount} 件`);
  console.log(`エラー: ${errorCount} 件`);
  console.log(`変更なし: ${results.length - changedCount - errorCount} 件`);

  if (changedCount > 0 && dryRun) {
    console.log("");
    console.log("💡 --dry-run を外して再実行すると、実際にファイルが更新されます。");
  }

  if (changedCount > 0 && !dryRun) {
    console.log("");
    console.log("📁 バックアップファイル（.bak）が作成されました。");
    console.log("   問題がなければ .bak ファイルを削除してください。");
  }

  // 詳細レポート（変更があった場合）
  const changedResults = results.filter((r) => r.changed);
  if (changedResults.length > 0) {
    console.log("");
    console.log("=== 詳細レポート ===");
    for (const r of changedResults) {
      const relativePath = path.relative(projectPath, r.file);
      console.log(`\n${relativePath}:`);
      for (const field of r.fieldsUpdated.slice(0, 10)) {
        console.log(`  - ${field}`);
      }
      if (r.fieldsUpdated.length > 10) {
        console.log(`  ... 他 ${r.fieldsUpdated.length - 10} フィールド`);
      }
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
