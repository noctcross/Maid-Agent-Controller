/**
 * ステータス遷移バリデーション テスト
 *
 * 設計書: docs/Maid-Agent-Controller/設計書/02_メッセンジャーサーバ/ダッシュボード/ステータス遷移設計.md
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { validateStatusTransition, getAgentRole } from "../task-manager.js";

describe("validateStatusTransition", () => {
  describe("正常系 - 通常遷移", () => {
    it("pending → assigned (chief) は許可される", () => {
      const result = validateStatusTransition("pending", "assigned", "chief");
      expect(result.valid).toBe(true);
    });

    it("assigned → working (maid) は許可される", () => {
      const result = validateStatusTransition("assigned", "working", "maid");
      expect(result.valid).toBe(true);
    });

    it("working → waiting (maid) は許可される", () => {
      const result = validateStatusTransition("working", "waiting", "maid");
      expect(result.valid).toBe(true);
    });

    it("working → checkpoint (maid) は許可される", () => {
      const result = validateStatusTransition("working", "checkpoint", "maid");
      expect(result.valid).toBe(true);
    });

    it("working → completed (maid) は許可される", () => {
      const result = validateStatusTransition("working", "completed", "maid");
      expect(result.valid).toBe(true);
    });

    it("waiting → working (maid) は許可される", () => {
      const result = validateStatusTransition("waiting", "working", "maid");
      expect(result.valid).toBe(true);
    });

    it("waiting → checkpoint (maid) は許可される", () => {
      const result = validateStatusTransition("waiting", "checkpoint", "maid");
      expect(result.valid).toBe(true);
    });

    it("checkpoint → working (chief) は許可される", () => {
      const result = validateStatusTransition("checkpoint", "working", "chief");
      expect(result.valid).toBe(true);
    });

    it("checkpoint → waiting (maid) は許可される", () => {
      const result = validateStatusTransition("checkpoint", "waiting", "maid");
      expect(result.valid).toBe(true);
    });

    it("completed → archived (chief) は許可される", () => {
      const result = validateStatusTransition("completed", "archived", "chief");
      expect(result.valid).toBe(true);
    });
  });

  describe("正常系 - 条件付き遷移（差し戻し・再オープン）", () => {
    it("completed → working (chief) は許可される（レビュー差し戻し）", () => {
      const result = validateStatusTransition("completed", "working", "chief");
      expect(result.valid).toBe(true);
    });

    it("archived → working (butler) は許可される（再オープン）", () => {
      const result = validateStatusTransition("archived", "working", "butler");
      expect(result.valid).toBe(true);
    });
  });

  describe("正常系 - 上位権限での遷移", () => {
    it("pending → assigned (butler) は許可される（chief以上）", () => {
      const result = validateStatusTransition("pending", "assigned", "butler");
      expect(result.valid).toBe(true);
    });

    it("pending → assigned (master) は許可される（最上位権限）", () => {
      const result = validateStatusTransition("pending", "assigned", "master");
      expect(result.valid).toBe(true);
    });

    it("archived → working (master) は許可される（butler以上）", () => {
      const result = validateStatusTransition("archived", "working", "master");
      expect(result.valid).toBe(true);
    });
  });

  describe("異常系 - 不正遷移", () => {
    it("pending → completed は禁止される", () => {
      const result = validateStatusTransition("pending", "completed", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("pending → archived は禁止される", () => {
      const result = validateStatusTransition("pending", "archived", "chief");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("assigned → completed は禁止される（working経由必須）", () => {
      const result = validateStatusTransition("assigned", "completed", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("working → pending は禁止される（後戻り不可）", () => {
      const result = validateStatusTransition("working", "pending", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("working → assigned は禁止される（後戻り不可）", () => {
      const result = validateStatusTransition("working", "assigned", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("completed → pending は禁止される", () => {
      const result = validateStatusTransition("completed", "pending", "chief");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("completed → assigned は禁止される", () => {
      const result = validateStatusTransition("completed", "assigned", "chief");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });

    it("archived → completed は禁止される", () => {
      const result = validateStatusTransition("archived", "completed", "butler");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("許可されていません");
    });
  });

  describe("異常系 - 権限不足", () => {
    it("pending → assigned (maid) は権限不足で拒否される", () => {
      const result = validateStatusTransition("pending", "assigned", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("chief 以上の権限が必要");
    });

    it("checkpoint → working (maid) は権限不足で拒否される", () => {
      const result = validateStatusTransition("checkpoint", "working", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("chief 以上の権限が必要");
    });

    it("completed → working (maid) は権限不足で拒否される（差し戻し）", () => {
      const result = validateStatusTransition("completed", "working", "maid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("chief 以上の権限が必要");
    });

    it("archived → working (chief) は権限不足で拒否される（再オープン）", () => {
      const result = validateStatusTransition("archived", "working", "chief");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("butler 以上の権限が必要");
    });
  });

  describe("エッジケース", () => {
    it("同じステータスへの遷移は許可される（no-op）", () => {
      const result = validateStatusTransition("working", "working", "maid");
      expect(result.valid).toBe(true);
    });

    it("pending から pending への遷移は許可される（no-op）", () => {
      const result = validateStatusTransition("pending", "pending", "maid");
      expect(result.valid).toBe(true);
    });

    it("空文字列からの遷移は許可される（初期状態）", () => {
      // 空文字列は pending として扱われる想定
      const result = validateStatusTransition("", "pending", "maid");
      expect(result.valid).toBe(true);
    });
  });
});

describe("getAgentRole", () => {
  it("butler は butler を返す", () => {
    expect(getAgentRole("butler")).toBe("butler");
  });

  it("chief は chief を返す", () => {
    expect(getAgentRole("chief")).toBe("chief");
  });

  describe("メイドIDはすべて maid を返す", () => {
    const maidIds = ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];

    maidIds.forEach((maidId) => {
      it(`${maidId} は maid を返す`, () => {
        expect(getAgentRole(maidId)).toBe("maid");
      });
    });
  });

  it("未知のIDは maid を返す（デフォルト）", () => {
    expect(getAgentRole("unknown")).toBe("maid");
  });

  it("空文字列は maid を返す（デフォルト）", () => {
    expect(getAgentRole("")).toBe("maid");
  });
});
