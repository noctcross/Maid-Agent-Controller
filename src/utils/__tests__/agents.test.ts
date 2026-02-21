import { describe, it, expect } from 'vitest';
import {
    AGENTS_MAP,
    MAIDS_MAP,
    DEFAULT_MAID_ORDER,
    AGENT_COLORS,
    getAgent,
    getMaids,
    isValidAgentId,
    isValidMaidId
} from '../agents';
import type { AgentId, MaidId } from '../../types/agent';

describe('utils/agents', () => {
    describe('AGENTS_MAP', () => {
        it('全10エージェントが定義されていること', () => {
            expect(Object.keys(AGENTS_MAP)).toHaveLength(10);
        });

        it('butler が正しく定義されていること', () => {
            const butler = AGENTS_MAP.butler;
            expect(butler.id).toBe('butler');
            expect(butler.name).toBe('シルヴィア');
            expect(butler.role).toBe('butler');
            expect(butler.emoji).toBe('🎩');
            expect(butler.color).toHaveProperty('bg');
            expect(butler.color).toHaveProperty('accent');
        });

        it('chief が正しく定義されていること', () => {
            const chief = AGENTS_MAP.chief;
            expect(chief.id).toBe('chief');
            expect(chief.name).toBe('ビオラ');
            expect(chief.role).toBe('chiefMaid');
            expect(chief.emoji).toBe('👑');
        });

        it('メイド8人が maid ロールで定義されていること', () => {
            const maidIds: MaidId[] = ['emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'];
            maidIds.forEach(id => {
                expect(AGENTS_MAP[id].role).toBe('maid');
            });
        });

        it('各エージェントの name, emoji が空でないこと', () => {
            Object.values(AGENTS_MAP).forEach(agent => {
                expect(agent.name).toBeTruthy();
                expect(agent.emoji).toBeTruthy();
            });
        });
    });

    describe('MAIDS_MAP', () => {
        it('メイド8人のみが含まれること', () => {
            expect(Object.keys(MAIDS_MAP)).toHaveLength(8);
        });

        it('butler と chief が含まれないこと', () => {
            expect('butler' in MAIDS_MAP).toBe(false);
            expect('chief' in MAIDS_MAP).toBe(false);
        });

        it('全員の role が maid であること', () => {
            Object.values(MAIDS_MAP).forEach(maid => {
                expect(maid.role).toBe('maid');
            });
        });

        it('AGENTS_MAP と整合していること', () => {
            Object.entries(MAIDS_MAP).forEach(([id, config]) => {
                if (id in AGENTS_MAP) {
                    expect(AGENTS_MAP[id as AgentId]).toEqual(config);
                }
            });
        });
    });

    describe('DEFAULT_MAID_ORDER', () => {
        it('8人のメイドIDが含まれること', () => {
            expect(DEFAULT_MAID_ORDER).toHaveLength(8);
        });

        it('正しい順序で定義されていること', () => {
            expect(DEFAULT_MAID_ORDER).toEqual([
                'emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'
            ]);
        });

        it('全てのIDが MAIDS_MAP に存在すること', () => {
            DEFAULT_MAID_ORDER.forEach(id => {
                expect(id in MAIDS_MAP).toBe(true);
            });
        });
    });

    describe('AGENT_COLORS', () => {
        it('全10エージェントの色が定義されていること', () => {
            expect(Object.keys(AGENT_COLORS)).toHaveLength(10);
        });

        it('各色が bg と accent を持つこと', () => {
            Object.values(AGENT_COLORS).forEach(color => {
                expect(color).toHaveProperty('bg');
                expect(color).toHaveProperty('accent');
                expect(typeof color.bg).toBe('string');
                expect(typeof color.accent).toBe('string');
            });
        });

        it('AGENTS_MAP の color と一致すること', () => {
            Object.entries(AGENT_COLORS).forEach(([id, color]) => {
                expect(AGENTS_MAP[id as AgentId].color).toEqual(color);
            });
        });
    });

    describe('getAgent', () => {
        it('存在するエージェントを取得できること', () => {
            const butler = getAgent('butler');
            expect(butler).toBeDefined();
            expect(butler?.name).toBe('シルヴィア');
        });

        it('存在しないIDはundefinedを返すこと', () => {
            const result = getAgent('invalid' as AgentId);
            expect(result).toBeUndefined();
        });
    });

    describe('getMaids', () => {
        it('8人のメイド設定を返すこと', () => {
            const maids = getMaids();
            expect(maids).toHaveLength(8);
        });

        it('DEFAULT_MAID_ORDER の順序で返すこと', () => {
            const maids = getMaids();
            maids.forEach((maid, index) => {
                expect(maid.id).toBe(DEFAULT_MAID_ORDER[index]);
            });
        });
    });

    describe('isValidAgentId', () => {
        it('有効なエージェントIDでtrueを返すこと', () => {
            expect(isValidAgentId('butler')).toBe(true);
            expect(isValidAgentId('chief')).toBe(true);
            expect(isValidAgentId('emma')).toBe(true);
        });

        it('無効なIDでfalseを返すこと', () => {
            expect(isValidAgentId('invalid')).toBe(false);
            expect(isValidAgentId('')).toBe(false);
            expect(isValidAgentId('Butler')).toBe(false);
        });
    });

    describe('isValidMaidId', () => {
        it('有効なメイドIDでtrueを返すこと', () => {
            expect(isValidMaidId('emma')).toBe(true);
            expect(isValidMaidId('sophia')).toBe(true);
            expect(isValidMaidId('luna')).toBe(true);
        });

        it('butler, chiefでfalseを返すこと', () => {
            expect(isValidMaidId('butler')).toBe(false);
            expect(isValidMaidId('chief')).toBe(false);
        });

        it('無効なIDでfalseを返すこと', () => {
            expect(isValidMaidId('invalid')).toBe(false);
        });
    });
});
