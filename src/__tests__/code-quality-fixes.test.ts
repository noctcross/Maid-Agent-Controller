import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '..');

// =============================================================================
// Code Quality Fixes - TDD Tests
// All tests should FAIL initially until implementations are completed
// =============================================================================

describe('Phase 1: createSetupContext null safety', () => {
    it('should return SetupContext | undefined from createSetupContext method', () => {
        const typesContent = fs.readFileSync(path.join(SRC_DIR, 'types.ts'), 'utf-8');

        // AgentContext interfaceのcreateSetupContext()メソッドの戻り値を確認
        // 現在: createSetupContext(): SetupContext;
        // 期待: createSetupContext(): SetupContext | undefined;
        const methodPattern = /createSetupContext\(\)\s*:\s*SetupContext\s*\|?\s*undefined/;

        expect(typesContent).toMatch(methodPattern);
    });
});

describe('Phase 2: extension.ts async/await patterns', () => {
    const asyncHandlers = [
        'multiAgent.initialize',
        'multiAgent.resumeSessions',
        'multiAgent.startButler',
        'multiAgent.startChiefMaid',
        'multiAgent.startAgents',
        'multiAgent.startSelectedMaids',
        'multiAgent.startAll',
        'multiAgent.sendToButler',
        'multiAgent.sendToMaid',
        'multiAgent.startClaude',
        'multiAgent.watchFiles',
        'multiAgent.killPick',
        'multiAgent.restartPick',
        'multiAgent.processNotifications',
        'multiAgent.promoteRuleToGlobal'
    ];

    const syncHandlers = [
        'multiAgent.showController',
        'multiAgent.showDashboard',
        'multiAgent.openDashboardInBrowser',
        'multiAgent.stopWatchFiles',
        'multiAgent.openTmuxViewer',
        'multiAgent.killAll',
        'multiAgent.showStatus'
    ];

    it('should have async/await pattern for all async command handlers', () => {
        const extensionContent = fs.readFileSync(path.join(SRC_DIR, 'extension.ts'), 'utf-8');

        asyncHandlers.forEach(command => {
            // async () => { と try { の両方が存在することを確認
            const commandEscaped = command.replace(/\./g, '\\.');
            const asyncPattern = new RegExp(`registerCommand\\(['"]${commandEscaped}['"],\\s*async\\s*\\(`);
            const tryPattern = /try\s*{/;

            const commandMatch = extensionContent.match(asyncPattern);
            expect(commandMatch, `${command} should be async`).toBeTruthy();

            // コマンドハンドラのブロック内でtryが使われているかを確認
            // 簡易的にasync () => { から次の registerCommand までの範囲をチェック
            if (commandMatch && commandMatch.index !== undefined) {
                const startIdx = commandMatch.index;
                const nextCommandIdx = extensionContent.indexOf('registerCommand', startIdx + 1);
                const endIdx = nextCommandIdx !== -1 ? nextCommandIdx : extensionContent.length;
                const handlerBlock = extensionContent.slice(startIdx, endIdx);

                expect(handlerBlock, `${command} should have try-catch`).toMatch(tryPattern);
            }
        });
    });

    it('should NOT have async pattern for sync command handlers', () => {
        const extensionContent = fs.readFileSync(path.join(SRC_DIR, 'extension.ts'), 'utf-8');

        syncHandlers.forEach(command => {
            const commandEscaped = command.replace(/\./g, '\\.');
            const asyncPattern = new RegExp(`registerCommand\\(['"]${commandEscaped}['"],\\s*async\\s*\\(`);

            expect(extensionContent, `${command} should NOT be async`).not.toMatch(asyncPattern);
        });
    });
});

describe('Phase 3: dispose() timer cleanup', () => {
    it('should cleanup pendingReportChecks in dispose() method', () => {
        const controllerContent = fs.readFileSync(path.join(SRC_DIR, 'controller.ts'), 'utf-8');

        // dispose()メソッド内でpendingReportChecksのクリーンアップが行われているか確認
        const disposeMethodMatch = controllerContent.match(/public dispose\(\): void \{([\s\S]*?)\n\s{4}\}/);

        expect(disposeMethodMatch, 'dispose() method should exist').toBeTruthy();

        if (disposeMethodMatch) {
            const disposeBody = disposeMethodMatch[1];

            // pendingReportChecksのクリーンアップパターンをチェック
            // 期待: this.pendingReportChecks.forEach(...) または for...of
            const cleanupPattern = /(pendingReportChecks\.forEach|for\s*\(.*pendingReportChecks)/;

            expect(disposeBody, 'dispose() should cleanup pendingReportChecks').toMatch(cleanupPattern);
        }
    });
});

describe('Phase 5: restoreDashboardPanel message handlers', () => {
    const requiredHandlers = [
        'refresh',
        'openInBrowser',
        'showController',
        'openFile',
        'toggleReview',
        'toggleStar',
        'completedPage',
        'updateCompletedViewState'
    ];

    it('should have all 8 message handler cases in restoreDashboardPanel', () => {
        const dashboardContent = fs.readFileSync(path.join(SRC_DIR, 'ui/web-dashboard.ts'), 'utf-8');

        // restoreDashboardPanel関数を抽出
        const restoreFunctionMatch = dashboardContent.match(
            /export function restoreDashboardPanel\([^)]+\)[^{]*\{([\s\S]*?)(?=\nexport|\n\/\/\s*=|$)/
        );

        expect(restoreFunctionMatch, 'restoreDashboardPanel function should exist').toBeTruthy();

        if (restoreFunctionMatch) {
            const restoreBody = restoreFunctionMatch[1];

            // 各ハンドラケースが存在するか確認
            requiredHandlers.forEach(handler => {
                const casePattern = new RegExp(`case\\s+['"]${handler}['"]:`);
                expect(restoreBody, `Should have case '${handler}'`).toMatch(casePattern);
            });
        }
    });
});

describe('Phase 6: localhost:3100 constant extraction', () => {
    it('should NOT have hardcoded localhost:3100 in source files (excluding tests and constants.ts)', () => {
        const srcFiles = [
            'controller.ts',
            'extension.ts',
            'types.ts',
            'ui/web-dashboard.ts',
            'ui/controller-panel.ts',
            'ui/agent-panel-provider.ts',
            'ui/status-bar.ts'
        ];

        srcFiles.forEach(file => {
            const filePath = path.join(SRC_DIR, file);

            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const hardcodedPattern = /['"]https?:\/\/localhost:3100['"]/;

                expect(content, `${file} should not contain hardcoded localhost:3100`).not.toMatch(hardcodedPattern);
            }
        });
    });

    it('should export DASHBOARD_SERVER_PORT and DASHBOARD_SERVER_URL in constants.ts', () => {
        const constantsContent = fs.readFileSync(path.join(SRC_DIR, 'constants.ts'), 'utf-8');

        // DASHBOARD_SERVER_PORT定数の存在確認
        expect(constantsContent).toMatch(/export\s+const\s+DASHBOARD_SERVER_PORT\s*=/);

        // DASHBOARD_SERVER_URL定数の存在確認
        expect(constantsContent).toMatch(/export\s+const\s+DASHBOARD_SERVER_URL\s*=/);
    });
});

describe('Phase 8: setTimeout async try-catch in checkMaidReportToChief', () => {
    it('should have outer try-catch wrapping entire async callback in setTimeout', () => {
        const controllerContent = fs.readFileSync(path.join(SRC_DIR, 'controller.ts'), 'utf-8');

        // checkMaidReportToChief関数を抽出
        const checkMethodMatch = controllerContent.match(
            /private checkMaidReportToChief\([^)]+\)[^{]*\{([\s\S]*?)(?=\n\s{4}(?:private|public|protected|\}))/
        );

        expect(checkMethodMatch, 'checkMaidReportToChief method should exist').toBeTruthy();

        if (checkMethodMatch) {
            const methodBody = checkMethodMatch[1];

            // setTimeout内にasyncコールバックがあり、その中でtry-catchが使用されているパターン
            // setTimeout(async () => { try { ... } catch ... }, 5000);
            const setTimeoutAsyncTryCatchPattern = /setTimeout\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{\s*try\s*\{/;

            expect(methodBody, 'setTimeout should have async callback with outer try-catch').toMatch(setTimeoutAsyncTryCatchPattern);
        }
    });
});
