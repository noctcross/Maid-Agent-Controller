/**
 * normalizeTaskId テスト
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeTaskId } from "../../utils/task-id.js";
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
