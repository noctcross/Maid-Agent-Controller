/**
 * sanitizeDescription 関数のユニットテスト
 *
 * タスクタイトルをファイル名に使用する際のサニタイズ処理をテスト
 */
import { describe, it, expect } from "@jest/globals";
import { sanitizeDescription } from "../../utils/yaml-helper.js";
describe("sanitizeDescription", () => {
    describe("基本動作", () => {
        it("nullの場合は'untitled'を返す", () => {
            expect(sanitizeDescription(null)).toBe("untitled");
        });
        it("空文字の場合は'untitled'を返す", () => {
            expect(sanitizeDescription("")).toBe("untitled");
        });
        it("通常の文字列はそのまま返す", () => {
            expect(sanitizeDescription("テスト")).toBe("テスト");
        });
        it("1行目のみを取得する", () => {
            expect(sanitizeDescription("1行目\n2行目\n3行目")).toBe("1行目");
        });
    });
    describe("最大文字数制限", () => {
        it("デフォルト15文字に切り詰める", () => {
            const longText = "あいうえおかきくけこさしすせそたちつてと";
            expect(sanitizeDescription(longText)).toBe("あいうえおかきくけこさしすせそ");
        });
        it("maxLengthパラメータで文字数を指定できる", () => {
            const longText = "あいうえおかきくけこ";
            expect(sanitizeDescription(longText, 5)).toBe("あいうえお");
        });
    });
    describe("禁止文字の除去", () => {
        it("Windowsで使えない文字を除去する", () => {
            expect(sanitizeDescription('<test>"file"')).toBe("testfile");
            expect(sanitizeDescription("path/to\\file")).toBe("pathtofile");
            expect(sanitizeDescription("test:file?name")).toBe("testfilename");
            expect(sanitizeDescription("test|file*name")).toBe("testfilename");
        });
        it("制御文字を除去する", () => {
            expect(sanitizeDescription("test\x00file")).toBe("testfile");
        });
    });
    describe("半角スペースの処理（バグ修正）", () => {
        it("半角スペースをアンダースコアに置換する", () => {
            expect(sanitizeDescription("バグ調査 ダッシュボード説明欄")).toBe("バグ調査_ダッシュボード説明欄");
        });
        it("連続する半角スペースは1つのアンダースコアにする", () => {
            expect(sanitizeDescription("test  file")).toBe("test_file");
        });
        it("先頭・末尾のスペースはtrim後に処理される", () => {
            expect(sanitizeDescription("  test file  ")).toBe("test_file");
        });
    });
    describe("複合パターン", () => {
        it("禁止文字とスペースが混在するケース", () => {
            expect(sanitizeDescription("test: file name")).toBe("test_file_name");
        });
        it("日本語とスペースが混在するケース", () => {
            expect(sanitizeDescription("機能追加 新規API")).toBe("機能追加_新規API");
        });
    });
});
