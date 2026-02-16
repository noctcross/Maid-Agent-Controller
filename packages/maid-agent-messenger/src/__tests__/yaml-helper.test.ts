/**
 * yaml-helper テスト
 *
 * stringifyYaml() の動作検証
 * - 複数行文字列がリテラルブロック形式で出力されること
 * - 単一行文字列がリテラルブロックにならないこと
 *
 * @see docs/plans/task-219-1-yaml-newline-fix.md
 */

import { describe, it, expect } from "@jest/globals";
import { stringifyYaml } from "../utils/yaml-helper.js";
import * as yaml from "yaml";

describe("stringifyYaml", () => {
  // --- 単一行文字列のテスト（レビュー指摘: リテラルブロックにならないこと）---

  it("単一行文字列はリテラルブロックにならない", () => {
    const data = { title: "シンプルなタイトル" };
    const result = stringifyYaml(data);

    // リテラルブロック記号（|）が含まれないこと
    expect(result).not.toContain("|");
    // 正しくパースできること
    const parsed = yaml.parse(result);
    expect(parsed.title).toBe("シンプルなタイトル");
  });

  it("改行を含まない長い文字列もリテラルブロックにならない", () => {
    const longText = "これは改行を含まない長いテキストです。".repeat(10);
    const data = { description: longText };
    const result = stringifyYaml(data);

    // リテラルブロック記号（|）が含まれないこと
    expect(result).not.toContain("|");
    // 正しくパースできること
    const parsed = yaml.parse(result);
    expect(parsed.description).toBe(longText);
  });

  // --- 複数行文字列のテスト ---

  it("複数行文字列はリテラルブロック形式で出力される", () => {
    const data = {
      description: "## 背景\n#210-2 作業時に発生した問題です。\n\n### 詳細\n詳細な説明文。",
    };
    const result = stringifyYaml(data);

    // リテラルブロック形式（|）で出力されること
    expect(result).toContain("description: |");
    // \\n（エスケープ）ではなく実際の改行が含まれること
    expect(result).not.toContain("\\n");
    // 正しくパースできること
    const parsed = yaml.parse(result);
    expect(parsed.description).toContain("## 背景");
    expect(parsed.description).toContain("#210-2");
  });

  it("改行を含む description が正しく保存・復元される", () => {
    const originalDescription = `## 概要
タスク管理システムの改善

### 変更点
1. YAML出力形式の統一
2. エスケープ問題の解消

### 参考
- docs/plans/xxx.md`;

    const data = { description: originalDescription };
    const result = stringifyYaml(data);
    const parsed = yaml.parse(result);

    // 元の文字列と完全一致すること
    expect(parsed.description).toBe(originalDescription);
  });

  // --- 複合オブジェクトのテスト ---

  it("複数のフィールドを持つオブジェクトが正しく出力される", () => {
    const data = {
      id: "219",
      title: "YAML改善タスク",
      description: "## 背景\n複数行の説明\n\n### 詳細",
      status: "pending",
      summary: null,
    };
    const result = stringifyYaml(data);

    // 単一行フィールドはリテラルブロックにならない
    expect(result).toMatch(/title: ["']?YAML改善タスク["']?/);
    expect(result).toMatch(/status: ["']?pending["']?/);
    // 複数行フィールドはリテラルブロック
    expect(result).toContain("description: |");
    // 正しくパースできること
    const parsed = yaml.parse(result);
    expect(parsed.id).toBe("219");
    expect(parsed.title).toBe("YAML改善タスク");
    expect(parsed.description).toContain("## 背景");
  });

  // --- オプションのテスト ---

  it("lineWidth オプションが適用される", () => {
    const data = { description: "短いテキスト" };

    // デフォルト（120）と明示的指定で同じ結果
    const result1 = stringifyYaml(data);
    const result2 = stringifyYaml(data, { lineWidth: 120 });
    expect(result1).toBe(result2);

    // 異なる lineWidth でも正しくパースできる
    const result3 = stringifyYaml(data, { lineWidth: 80 });
    const parsed = yaml.parse(result3);
    expect(parsed.description).toBe("短いテキスト");
  });

  // --- 後方互換のテスト ---

  it("既存の tasks.yaml 形式（ダブルクォート）も読み込める", () => {
    // 旧形式: ダブルクォート + \\n エスケープ
    const oldFormat = 'description: "## 背景\\n説明文"';
    const parsed = yaml.parse(oldFormat);

    // \\n がリテラル文字列として解釈される（これは yaml パッケージの仕様）
    // 注: 実際のYAML仕様では "\\n" は改行ではなくリテラル2文字
    // この対症療法は markdown-utils.ts で行っている
    expect(parsed.description).toBeDefined();
  });

  it("新形式（リテラルブロック）で保存したデータが読み込める", () => {
    const newFormat = `description: |
  ## 背景
  説明文`;
    const parsed = yaml.parse(newFormat);

    expect(parsed.description).toContain("## 背景");
    expect(parsed.description).toContain("説明文");
  });

  // --- 配列を含むオブジェクト ---

  it("配列を含むオブジェクトが正しく出力される", () => {
    const data = {
      tasks: [
        { id: "001", title: "タスク1", description: "単一行" },
        { id: "002", title: "タスク2", description: "複数行\n説明" },
      ],
    };
    const result = stringifyYaml(data);
    const parsed = yaml.parse(result);

    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].description).toBe("単一行");
    expect(parsed.tasks[1].description).toBe("複数行\n説明");
  });
});
