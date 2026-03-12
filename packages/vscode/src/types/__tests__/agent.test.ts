import { describe, it, expect } from 'vitest';
import type {
    AgentRole,
    MaidId,
    AgentId,
    AgentColorConfig,
    AgentConfig,
    MaidConfig
} from '../agent';

describe('types/agent', () => {
    describe('AgentRole', () => {
        it('butler, chiefMaid, maid の3種類であること', () => {
            const roles: AgentRole[] = ['butler', 'chiefMaid', 'maid'];
            expect(roles).toHaveLength(3);
        });
    });

    describe('MaidId', () => {
        it('8人のメイドIDが定義されていること', () => {
            const maidIds: MaidId[] = [
                'emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'
            ];
            expect(maidIds).toHaveLength(8);
        });
    });

    describe('AgentId', () => {
        it('butler, chief, 8人のメイドの計10エージェントが定義されていること', () => {
            const agentIds: AgentId[] = [
                'butler', 'chief',
                'emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'
            ];
            expect(agentIds).toHaveLength(10);
        });
    });

    describe('AgentColorConfig', () => {
        it('bg と accent プロパティを持つこと', () => {
            const colorConfig: AgentColorConfig = {
                bg: '#1a1a2e',
                accent: '#008080'
            };
            expect(colorConfig.bg).toBe('#1a1a2e');
            expect(colorConfig.accent).toBe('#008080');
        });
    });

    describe('AgentConfig', () => {
        it('id, name, role, emoji, color を持つこと', () => {
            const config: AgentConfig = {
                id: 'butler',
                name: 'シルヴィア',
                role: 'butler',
                emoji: '🎩',
                color: { bg: '#1a1a2e', accent: '#008080' }
            };
            expect(config.id).toBe('butler');
            expect(config.name).toBe('シルヴィア');
            expect(config.role).toBe('butler');
            expect(config.emoji).toBe('🎩');
            expect(config.color.bg).toBe('#1a1a2e');
            expect(config.color.accent).toBe('#008080');
        });
    });

    describe('MaidConfig', () => {
        it('role が maid 固定で id が MaidId であること', () => {
            const config: MaidConfig = {
                id: 'emma',
                name: 'エマ',
                role: 'maid',
                emoji: '☕',
                color: { bg: '#1a1a2e', accent: '#8B5A2B' }
            };
            expect(config.role).toBe('maid');
            expect(config.id).toBe('emma');
        });
    });
});
