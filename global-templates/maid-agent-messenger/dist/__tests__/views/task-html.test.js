/**
 * task-html テスト
 * generateTaskHtml() の報告書リンクにproject queryパラメータが含まれることを検証
 */
import { describe, it, expect } from "@jest/globals";
import { generateTaskHtml, composeMasterWaitingHtml } from "../../views/task-html.js";
const PROJECT_PATH = "/mnt/c/Users/noct/Development/TestProject";
describe("generateTaskHtml - report links", () => {
    const completedTask = {
        id: "test-001",
        title: "テストタスク",
        description: "テスト説明",
        priority: "medium",
        status: "completed",
        assignees: [{ agentId: "lily" }],
        createdAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T01:00:00Z",
        reportPaths: [".maid-agent/system/data/reports/current_lily.md"],
        reviewed: false,
        starred: false,
    };
    it("報告書リンクにproject queryパラメータが含まれる", () => {
        const html = generateTaskHtml([completedTask], "completed", PROJECT_PATH);
        expect(html).toContain(`&project=${encodeURIComponent(PROJECT_PATH)}`);
    });
    it("報告書リンクのhrefに/file?path=が含まれる", () => {
        const html = generateTaskHtml([completedTask], "completed", PROJECT_PATH);
        expect(html).toContain('/file?path=');
    });
    it("報告書がないタスクではreport linkが生成されない", () => {
        const taskNoReport = { ...completedTask, reportPaths: [] };
        const html = generateTaskHtml([taskNoReport], "completed", PROJECT_PATH);
        expect(html).not.toContain("report-link");
    });
    it("報告書リンクのonclickパスがWSLパスのまま（Windows変換されない）", () => {
        const html = generateTaskHtml([completedTask], "completed", PROJECT_PATH);
        // WSLパスがそのまま使われること
        expect(html).toContain("/mnt/c/Users/noct/Development/TestProject/.maid-agent/system/data/reports/current_lily.md");
        // Windowsパスに変換されていないこと
        expect(html).not.toContain("C:/Users/noct");
    });
});
describe("master_review type", () => {
    it("master_review タスクが action-required-item クラスで生成される", () => {
        const tasks = [{
                id: "001",
                title: "確認待ちタスク",
                description: "テスト",
                completedAt: "2026-02-08T10:00:00+09:00",
                summary: "完了サマリー",
            }];
        const html = generateTaskHtml(tasks, "master_review", "/test/project");
        expect(html).toContain("action-required-item");
        expect(html).toContain("001");
        expect(html).toContain("確認待ちタスク");
    });
    it("master_review タスクに review/star ボタンが含まれない", () => {
        const tasks = [{
                id: "001",
                title: "確認待ちタスク",
                description: "テスト",
                completedAt: "2026-02-08T10:00:00+09:00",
            }];
        const html = generateTaskHtml(tasks, "master_review", "/test/project");
        expect(html).not.toContain("review-btn");
        expect(html).not.toContain("star-btn");
    });
});
describe("composeMasterWaitingHtml - 対応待ちセクション結合", () => {
    const PROJECT_PATH = "/test/project";
    const actionRequiredTask = {
        id: "ar-001",
        title: "判断待ちタスク",
        description: "ご主人様の判断が必要",
        status: "blocked",
        substatus: "技術方針の決定待ち",
        assignees: [{ agentId: "emma" }],
        priority: "high",
    };
    const masterReviewTask = {
        id: "mr-001",
        title: "確認待ちタスク",
        description: "完了した要対応タスク",
        completedAt: "2026-02-08T10:00:00+09:00",
        summary: "完了しました",
    };
    it("両方空の場合、「なし」が1つだけ表示される", () => {
        const html = composeMasterWaitingHtml([], [], PROJECT_PATH);
        const matches = html.match(/なし/g);
        expect(matches).toHaveLength(1);
        expect(html).toContain("empty-message");
    });
    it("masterWaitingのみにタスクがある場合、アクティブのサブセクションヘッダーが表示される", () => {
        const html = composeMasterWaitingHtml([actionRequiredTask], [], PROJECT_PATH);
        expect(html).toContain("アクティブ (1)");
        expect(html).toContain("ar-001");
        expect(html).not.toContain("確認待ち");
        expect(html).not.toContain("empty-message");
    });
    it("masterReviewのみにタスクがある場合、確認待ちのサブセクションヘッダーが表示される", () => {
        const html = composeMasterWaitingHtml([], [masterReviewTask], PROJECT_PATH);
        expect(html).toContain("確認待ち (1)");
        expect(html).toContain("mr-001");
        expect(html).not.toContain("アクティブ");
        expect(html).not.toContain("empty-message");
    });
    it("両方にタスクがある場合、両方のサブセクションヘッダーが表示される", () => {
        const html = composeMasterWaitingHtml([actionRequiredTask], [masterReviewTask], PROJECT_PATH);
        expect(html).toContain("アクティブ (1)");
        expect(html).toContain("確認待ち (1)");
        expect(html).toContain("ar-001");
        expect(html).toContain("mr-001");
        expect(html).not.toContain("empty-message");
    });
    it("複数タスクの件数が正しく表示される", () => {
        const tasks = [actionRequiredTask, { ...actionRequiredTask, id: "ar-002", title: "もう1つ" }];
        const html = composeMasterWaitingHtml(tasks, [], PROJECT_PATH);
        expect(html).toContain("アクティブ (2)");
    });
});
