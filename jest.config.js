/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/packages/', '/global-templates/'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    },
};
