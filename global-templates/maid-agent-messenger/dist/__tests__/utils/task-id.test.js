/**
 * タスクID正規化ユーティリティのテスト
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeTaskId, normalizeParentId, isSameTaskId } from "../../utils/task-id.js";
describe("normalizeTaskId", () => {
    it("task- プレフィックスを除去する", () => {
        expect(normalizeTaskId("task-070")).toBe("070");
    });
    it("複数回出現する task- プレフィックスを全て除去する", () => {
        expect(normalizeTaskId("task-task-070")).toBe("070");
    });
    it("プレフィックスなしの場合はそのまま返す", () => {
        expect(normalizeTaskId("070")).toBe("070");
    });
    it("agentId 指定時に末尾の -agentId を除去する", () => {
        expect(normalizeTaskId("070-lily", "lily")).toBe("070");
    });
    it("agentId 指定時にプレフィックスと末尾の両方を除去する", () => {
        expect(normalizeTaskId("task-070-emma", "emma")).toBe("070");
    });
    it("agentId が末尾にない場合は除去しない", () => {
        expect(normalizeTaskId("task-070-1", "emma")).toBe("070-1");
    });
    it("サブタスクID（ハイフン付き）を正しく処理する", () => {
        expect(normalizeTaskId("task-072-1")).toBe("072-1");
    });
    it("数値をStringに変換して処理する", () => {
        expect(normalizeTaskId(String(70))).toBe("70");
    });
    it("大文字小文字を区別しない", () => {
        expect(normalizeTaskId("TASK-070")).toBe("070");
        expect(normalizeTaskId("Task-070-Emma", "emma")).toBe("070");
    });
});
describe("normalizeParentId", () => {
    it("ゼロなしのIDを3桁ゼロ埋めする", () => {
        expect(normalizeParentId("49")).toBe("049");
    });
    it("既にゼロ埋めされているIDはそのまま", () => {
        expect(normalizeParentId("049")).toBe("049");
    });
    it("サブタスクID（XX-YY形式）を正しく処理する", () => {
        expect(normalizeParentId("49-1")).toBe("049-1");
        expect(normalizeParentId("049-1")).toBe("049-1");
    });
    it("孫タスクID（XX-YY-ZZ形式）を正しく処理する", () => {
        expect(normalizeParentId("49-1-2")).toBe("049-1-2");
        expect(normalizeParentId("049-1-2")).toBe("049-1-2");
    });
    it("先頭のゼロが複数ある場合も正しく処理する", () => {
        expect(normalizeParentId("0049")).toBe("049");
        expect(normalizeParentId("00049")).toBe("049");
    });
    it("null/undefinedの場合はnullを返す", () => {
        expect(normalizeParentId(null)).toBeNull();
        expect(normalizeParentId(undefined)).toBeNull();
    });
    it("100以上のIDも正しく処理する", () => {
        expect(normalizeParentId("100")).toBe("100");
        expect(normalizeParentId("999")).toBe("999");
        expect(normalizeParentId("1000")).toBe("1000");
    });
});
describe("isSameTaskId", () => {
    it("同一のIDをtrueと判定する", () => {
        expect(isSameTaskId("049", "049")).toBe(true);
    });
    it("ゼロ埋めの有無が異なるIDを同一と判定する", () => {
        expect(isSameTaskId("49", "049")).toBe(true);
        expect(isSameTaskId("049", "49")).toBe(true);
    });
    it("サブタスクIDでも正しく比較する", () => {
        expect(isSameTaskId("49-1", "049-1")).toBe(true);
        expect(isSameTaskId("049-1", "49-1")).toBe(true);
    });
    it("異なるIDをfalseと判定する", () => {
        expect(isSameTaskId("049", "050")).toBe(false);
        expect(isSameTaskId("049-1", "049-2")).toBe(false);
    });
    it("null同士はtrueと判定する", () => {
        expect(isSameTaskId(null, null)).toBe(true);
    });
    it("片方がnullの場合はfalseと判定する", () => {
        expect(isSameTaskId("049", null)).toBe(false);
        expect(isSameTaskId(null, "049")).toBe(false);
    });
});
