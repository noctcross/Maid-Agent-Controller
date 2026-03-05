---
name: test-oom-prevention
description: Jest ESMテストでのOOMリスクを防止するガイドライン（beforeAll/afterAllパターン優先）
auto_select: true
target_roles: [common]
---

# テストOOM防止ガイドライン

## 概要

Jest ESM テスト（`jest.unstable_mockModule` 使用時）において、重いモジュールの繰り返しインポートによるOOM（Out of Memory）を防止する。
`beforeAll` / `afterAll` パターンを優先し、`beforeEach` での重いモジュール再インポートを禁止する。

### 背景

- task-081-6 で `jest.unstable_mockModule()` + `jest.resetModules()` を `beforeEach` で使用したところ、MCP SDK 等の重いモジュールが毎テストケースで再インポートされ OOM が発生した
- `beforeAll` / `afterAll` パターンに変更することで解決

## ルール内容

### 必須事項

1. **重いモジュールのインポートは `beforeAll` で1回だけ行う**
   - MCP SDK、Express、大規模ライブラリ等は `beforeAll` でインポート
   - `beforeEach` での再インポートは禁止

   ```typescript
   // OK - beforeAll で1回だけインポート
   let targetModule;

   beforeAll(async () => {
     jest.unstable_mockModule("dependency", () => ({ ... }));
     targetModule = await import("./target.js");
   });

   afterAll(() => {
     jest.restoreAllMocks();
   });

   // NG - beforeEach で毎回再インポート（OOMリスク）
   beforeEach(async () => {
     jest.resetModules();
     jest.unstable_mockModule("dependency", () => ({ ... }));
     targetModule = await import("./target.js");  // 毎回重いモジュールを読み込み
   });
   ```

2. **`jest.resetModules()` を `beforeEach` で使用しない**
   - モジュールキャッシュの全クリアは重いモジュールの再読み込みを引き起こす
   - テスト間の状態リセットはモックの戻り値変更で対応する

   ```typescript
   // OK - モックの戻り値を変更して状態リセット
   const mockFn = jest.fn();

   beforeAll(async () => {
     jest.unstable_mockModule("dependency", () => ({
       doSomething: mockFn,
     }));
     targetModule = await import("./target.js");
   });

   beforeEach(() => {
     mockFn.mockClear();  // 呼び出し履歴のみクリア
   });
   ```

3. **テスト設計時にOOMリスクを事前評価する**
   - 以下の組み合わせが存在する場合、OOMリスクありと判断する

   | 要素 | リスク |
   |------|--------|
   | `jest.resetModules()` + `beforeEach` | 高 |
   | `await import()` + `beforeEach` | 高（対象モジュールが重い場合） |
   | テストケース数 20件以上 + 動的インポート | 中 |
   | `jest.unstable_mockModule` + `beforeEach` | 中〜高 |

### 推奨事項

1. **`describe` ブロックの分割でモック切り替え**
   - 異なるモック設定が必要な場合は `describe` を分割し、各ブロックの `beforeAll` でモックを設定

   ```typescript
   describe("正常系", () => {
     beforeAll(async () => {
       jest.unstable_mockModule("dep", () => ({ fn: () => "ok" }));
       mod = await import("./target.js");
     });
     afterAll(() => jest.restoreAllMocks());

     it("成功する", () => { ... });
   });

   describe("異常系", () => {
     beforeAll(async () => {
       jest.unstable_mockModule("dep", () => ({ fn: () => { throw new Error(); } }));
       mod = await import("./target.js");
     });
     afterAll(() => jest.restoreAllMocks());

     it("エラーを返す", () => { ... });
   });
   ```

2. **テスト実行時のメモリ監視**
   - テストが遅い・不安定な場合は `--logHeapUsage` で確認
   ```bash
   npm test -- --logHeapUsage
   ```

3. **jest-esm-testing スキルとの併用**
   - ESM テストの基本パターンは `jest-esm-testing` スキルを参照
   - 本ルールはOOM防止に特化した追加ガイドライン

### 禁止事項

1. **`beforeEach` での重いモジュールの動的インポート**
   - MCP SDK、Express、大規模ライブラリを `beforeEach` 内で `await import()` しない

2. **`beforeEach` での `jest.resetModules()` 使用**
   - モジュールキャッシュの全クリアをテストケースごとに行わない

3. **OOM発生時の `--max-old-space-size` 増加による回避**
   - メモリ上限の引き上げは根本解決ではない
   - テスト設計の見直しで対処すること

---

## 適用範囲

| 対象 | 適用 | 備考 |
|------|------|------|
| ESM パッケージのテスト | 必須 | `jest.unstable_mockModule` 使用時 |
| CommonJS パッケージのテスト | 推奨 | `jest.mock` でも同様のリスクあり |
| CI/CD パイプライン | 必須 | メモリ制限が厳しい環境 |

---

## 関連スキル

| スキル | 関係 |
|--------|------|
| `jest-esm-testing` | ESM テストの基本パターン（本ルールはOOM防止の追加ガイドライン） |
| `implementation-pipeline` | Step 5（TDD実装）でのテスト設計時に本ルールを考慮 |
