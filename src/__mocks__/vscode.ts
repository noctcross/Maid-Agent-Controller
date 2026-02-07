// vscode モジュールのモック
export const Uri = {
    file: (filePath: string) => ({ fsPath: filePath, scheme: 'file' }),
    joinPath: (...parts: string[]) => ({ fsPath: parts.join('/') }),
    parse: (value: string) => ({ toString: () => value }),
};

export const window = {
    createOutputChannel: () => ({
        appendLine: jest.fn(),
        dispose: jest.fn(),
        show: jest.fn(),
    }),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    createStatusBarItem: jest.fn(() => ({
        text: '',
        command: '',
        tooltip: '',
        show: jest.fn(),
        dispose: jest.fn(),
    })),
    registerWebviewViewProvider: jest.fn(),
    registerWebviewPanelSerializer: jest.fn(),
    onDidChangeActiveTerminal: jest.fn(),
    onDidCloseTerminal: jest.fn(),
    activeTerminal: undefined,
};

export const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
    })),
    onDidChangeConfiguration: jest.fn(),
};

export const commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
};

export const env = {
    openExternal: jest.fn(),
};

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum ViewColumn {
    Active = -1,
    One = 1,
    Two = 2,
}
