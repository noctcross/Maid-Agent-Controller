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
    it('should cleanup pendingReportChecks via FileWatcher module', () => {
        // #425-5 責務分割: pendingReportChecksのクリーンアップはfile-watcher.tsに移動

        // 1. controller.ts の dispose() が FileWatcher.disposeFileWatcher を呼び出していることを確認
        const controllerContent = fs.readFileSync(path.join(SRC_DIR, 'controller.ts'), 'utf-8');
        const disposeMethodMatch = controllerContent.match(/public dispose\(\): void \{([\s\S]*?)\n\s{4}\}/);

        expect(disposeMethodMatch, 'dispose() method should exist').toBeTruthy();

        if (disposeMethodMatch) {
            const disposeBody = disposeMethodMatch[1];
            const delegationPattern = /FileWatcher\.disposeFileWatcher/;
            expect(disposeBody, 'dispose() should call FileWatcher.disposeFileWatcher').toMatch(delegationPattern);
        }

        // 2. file-watcher.ts の disposeFileWatcher が pendingReportChecks をクリーンアップしていることを確認
        const fileWatcherContent = fs.readFileSync(path.join(SRC_DIR, 'events', 'file-watcher.ts'), 'utf-8');
        const disposeFileWatcherMatch = fileWatcherContent.match(/export function disposeFileWatcher\([^)]+\)[^{]*\{([\s\S]*?)\n\}/);

        expect(disposeFileWatcherMatch, 'disposeFileWatcher function should exist').toBeTruthy();

        if (disposeFileWatcherMatch) {
            const functionBody = disposeFileWatcherMatch[1];
            const cleanupPattern = /(pendingReportChecks\.forEach|for\s*\(.*pendingReportChecks)/;
            expect(functionBody, 'disposeFileWatcher should cleanup pendingReportChecks').toMatch(cleanupPattern);
        }
    });
});

describe('Phase 5: setupDashboardMessageHandler message handlers', () => {
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

    it('should have all 8 message handler cases in setupDashboardMessageHandler', () => {
        const dashboardContent = fs.readFileSync(path.join(SRC_DIR, 'ui/web-dashboard.ts'), 'utf-8');

        // setupDashboardMessageHandler関数を抽出（restoreDashboardPanelから呼ばれる共通ハンドラ）
        const handlerFunctionMatch = dashboardContent.match(
            /function setupDashboardMessageHandler\([^)]+\)[^{]*\{([\s\S]*?)(?=\n(?:export )?function|\n\/\/\s*=|$)/
        );

        expect(handlerFunctionMatch, 'setupDashboardMessageHandler function should exist').toBeTruthy();

        if (handlerFunctionMatch) {
            const handlerBody = handlerFunctionMatch[1];

            // 各ハンドラケースが存在するか確認
            requiredHandlers.forEach(handler => {
                const casePattern = new RegExp(`case\\s+['"]${handler}['"]:`);
                expect(handlerBody, `Should have case '${handler}'`).toMatch(casePattern);
            });
        }
    });

    it('should call setupDashboardMessageHandler from restoreDashboardPanel', () => {
        const dashboardContent = fs.readFileSync(path.join(SRC_DIR, 'ui/web-dashboard.ts'), 'utf-8');

        // restoreDashboardPanelがsetupDashboardMessageHandlerを呼んでいることを確認
        const restoreFunctionMatch = dashboardContent.match(
            /export function restoreDashboardPanel\([^)]+\)[^{]*\{([\s\S]*?)(?=\nexport|\n\/\/\s*=|$)/
        );

        expect(restoreFunctionMatch, 'restoreDashboardPanel function should exist').toBeTruthy();

        if (restoreFunctionMatch) {
            const restoreBody = restoreFunctionMatch[1];
            expect(restoreBody, 'Should call setupDashboardMessageHandler').toMatch(/setupDashboardMessageHandler\(/);
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
        // checkMaidReportToChief は file-watcher.ts に移動（#425-5 責務分割）
        const fileWatcherContent = fs.readFileSync(path.join(SRC_DIR, 'events', 'file-watcher.ts'), 'utf-8');

        // checkMaidReportToChief関数を抽出
        const checkMethodMatch = fileWatcherContent.match(
            /function checkMaidReportToChief\([^)]+\)[^{]*\{([\s\S]*?)(?=\n(?:export\s+)?function|\n\}$)/
        );

        expect(checkMethodMatch, 'checkMaidReportToChief function should exist in file-watcher.ts').toBeTruthy();

        if (checkMethodMatch) {
            const methodBody = checkMethodMatch[1];

            // setTimeout内にasyncコールバックがあり、その中でtry-catchが使用されているパターン
            // setTimeout(async () => { try { ... } catch ... }, 5000);
            const setTimeoutAsyncTryCatchPattern = /setTimeout\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{\s*try\s*\{/;

            expect(methodBody, 'setTimeout should have async callback with outer try-catch').toMatch(setTimeoutAsyncTryCatchPattern);
        }
    });
});
