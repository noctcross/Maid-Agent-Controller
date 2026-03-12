/**
 * MaidID定義の一貫性テスト
 *
 * VSCode拡張 (DEFAULT_MAID_ORDER) と maid-agent-messenger (MAID_IDS) の
 * 定義が一致することを確認します。
 *
 * このテストが失敗した場合:
 * 1. src/utils/agents.ts の DEFAULT_MAID_ORDER
 * 2. packages/maid-agent-messenger/src/types/index.ts の MAID_IDS
 * の両方を同じ値・同じ順序に更新してください。
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MAID_ORDER } from '../agents';

// maid-agent-messenger の MAID_IDS と同じ値を期待値として定義
// （パッケージ間の依存を避けるため、値を直接記述）
const EXPECTED_MAID_IDS = [
    'emma',
    'sophia',
    'lily',
    'rose',
    'alice',
    'may',
    'flora',
    'luna',
] as const;

describe('MaidID定義の一貫性', () => {
    it('DEFAULT_MAID_ORDER が期待されるMaidIDと一致すること', () => {
        expect(DEFAULT_MAID_ORDER).toEqual([...EXPECTED_MAID_IDS]);
    });

    it('MaidIDの数が8人であること', () => {
        expect(DEFAULT_MAID_ORDER).toHaveLength(8);
        expect(EXPECTED_MAID_IDS).toHaveLength(8);
    });

    it('MaidIDの順序が一致すること', () => {
        DEFAULT_MAID_ORDER.forEach((id, index) => {
            expect(id).toBe(EXPECTED_MAID_IDS[index]);
        });
    });

    it('重複するMaidIDがないこと', () => {
        const uniqueIds = new Set(DEFAULT_MAID_ORDER);
        expect(uniqueIds.size).toBe(DEFAULT_MAID_ORDER.length);
    });
});
