---
name: silent-error-prevention
description: try-catch内でのエラー握りつぶしを禁止し、catch内でのエラー出力を義務化するルール
auto_select: true
target_roles: [common]
---

# サイレントエラー防止ルール

## 概要

try-catch ブロック内でエラーを握りつぶす（何も出力せずに無視する）ことを禁止する。
catch 内では最低限 `console.error` でエラー内容を出力し、不具合の早期発見を可能にする。

### 背景

- task-088 で executeSideEffects 等の4段階 try-catch が全エラーを握りつぶしており、不具合発見が著しく遅れた
- サイレントキャッチは「エラーが起きていない」ように見えるため、問題の切り分けが困難になる
- 特に多段階の try-catch ではエラーの伝播が追跡不能になる

## ルール内容

### 必須事項

1. **catch ブロック内で必ずエラー情報を出力する**
   - 最低限 `console.error` でエラー内容を記録すること
   - エラーオブジェクト自体を出力に含めること（メッセージだけでなくスタックトレースも）

   ```typescript
   // OK
   try {
     await riskyOperation();
   } catch (error) {
     console.error("riskyOperation failed:", error);
   }

   // NG - サイレントキャッチ
   try {
     await riskyOperation();
   } catch (error) {
     // 何も出力しない
   }

   // NG - エラーオブジェクトを無視
   try {
     await riskyOperation();
   } catch {
     console.log("something went wrong");
   }
   ```

2. **多段階 try-catch では各段階でエラーの発生元を識別できるようにする**
   - ログメッセージに関数名やコンテキスト情報を含めること

   ```typescript
   // OK - どの段階で失敗したか識別可能
   try {
     await stepA();
   } catch (error) {
     console.error("[stepA] failed:", error);
   }

   try {
     await stepB();
   } catch (error) {
     console.error("[stepB] failed:", error);
   }
   ```

3. **意図的にエラーを無視する場合はコメントで理由を明記する**
   - 正当な理由がある場合のみ許容（例: ファイル存在確認で ENOENT を無視）
   - コメントなしの空 catch は禁止

   ```typescript
   // OK - 正当な理由を明記
   try {
     await fs.access(filePath);
   } catch {
     // ファイルが存在しない場合は新規作成するため、エラーは無視
   }
   ```

### 推奨事項

1. **構造化ロガーの使用**
   - プロジェクトにロガーがある場合は `console.error` より構造化ロガーを優先

2. **エラーの再スロー検討**
   - catch 後にログ出力した上で、呼び出し元に伝播させるべきか検討すること
   - 握りつぶしてよいエラーか、上位で処理すべきエラーかを判断

3. **レビュー時の確認**
   - コードレビューで空 catch や `catch { }` パターンを検出したら指摘する

### 禁止事項

1. **空の catch ブロック**
   - コメントもログ出力もない空の catch は禁止
   ```typescript
   // 禁止
   try { ... } catch (e) { }
   try { ... } catch { }
   ```

2. **エラー変数の未使用**
   - catch でエラーを受け取りながら使用しないパターンは禁止
   ```typescript
   // 禁止
   try { ... } catch (error) {
     console.log("failed");  // error を使っていない
   }
   ```

---

## 適用範囲

| 対象 | 適用 | 備考 |
|------|------|------|
| プロダクションコード | 必須 | 全 try-catch ブロック |
| テストコード | 推奨 | expect().toThrow() 等のアサーション用 catch は除外 |
| スクリプト・ツール | 必須 | CLI ツール、デプロイスクリプト等 |

---

## 既存コードへの適用

- 新規コードは即時適用
- 既存コードは変更時に順次適用（変更対象の catch ブロックを修正）
- 既存コードの一括修正は別タスクとして計画
