---
codd:
  node_id: "research:maid-agent-controller-my-status-mechanism-reform"
  modules: []
  status: active
  depends_on: []
  depended_by: []
---

# my-status 機構欠陥の改修方法検討レポート

**調査担当**: メイ（task-840-3）  
**作成日**: 2026-05-15  
**移管**: 2026-07-08、MaidsHouse `docs/research/` から本リポジトリへ移管（task-1502-2・rose）  
**対象**: MaidAgentController/packages/maid-agent-messenger

---

## 1. 調査概要

CP closure（task completed 化）時に実装メイドの my-status（maid yaml の status フィールド）が
`working` のまま取り残される機構欠陥の原因を特定し、改修案を提示する。

---

## 2. 現行アーキテクチャ

### 2.1 状態管理の全体像

```
[メイド]                    [サービス層]                   [ストレージ]
maidctl set my-status →  PATCH /api/agents/:id/status
                          → executeUpdateStatus()        → agentId.yaml（maid yaml）
                          → executeUpdateTask()          → tasks.yaml
                            → executeSideEffects()
                              → syncMaidYaml()          → agentId.yaml（同期）
                              → archiveReport()         → master/reports/
```

### 2.2 関連ファイルと責務

| ファイル | 行数 | 責務 |
|--------|-----|------|
| `services/update-status.ts` | 97行 | maidctl → API 経路のエントリポイント（maid yaml → taskId → executeUpdateTask に委譲） |
| `services/task-crud-update.ts` | 338行 | `executeUpdateTask`: tasks.yaml 更新 + 副作用実行 |
| `services/task-side-effects.ts` | 447行 | `executeSideEffects`: syncMaidYaml / archiveReport / initReportTemplate |
| `services/task-auto-close.ts` | 273行 | `checkAndAutoCloseParent`: 子タスク完了時の親タスク自動クローズ |
| `routes/cli-api-routes.ts` | 330行+ | `PATCH /api/agents/:id/status`（メイド自身の操作） |
| `routes/task-api-routes.ts` | 412行 | `PATCH /api/tasks/:id`（メイド長のタスク操作） |

---

## 3. 問題の根本原因

### 根本原因 A: `checkAndAutoCloseParent` が `syncMaidYaml` をスキップ

**最大の問題**。子タスクが完了した際に親タスクが自動クローズされるが、
担当メイドの maid yaml が更新されない。

**コード箇所**: `task-auto-close.ts:253-264`

```typescript
// 親を自動クローズ
await withTasksLock(projectPath, async (lockData) => {
  const parentTask = lockData.tasks.find((t) => t.id === parentId);
  if (parentTask) {
    parentTask.mainStatus = "closed";
    parentTask.subStatus = "completed";
    parentTask.status = "completed";     // tasks.yaml は更新される
    parentTask.completedAt = now;
    parentTask.updatedAt = now;
    // ← executeSideEffects / syncMaidYaml は呼ばれない
  }
  return { data: lockData, result: null };
});
```

**影響**: 担当メイドの `agentId.yaml` の `status` が `working` のまま残る。

### 根本原因 B: `PATCH /api/tasks/:id` が `agentId` を渡さない

**コード箇所**: `task-api-routes.ts:131-153`

```typescript
const result = await executeUpdateTask(projectPath, {
  taskId: req.params.id,
  status,
  // ← agentId が渡されていない
});
```

`executeSideEffects` の `syncMaidYaml` 呼び出し条件:

```typescript
// task-side-effects.ts:376-380
const assigneesChanged = params.assignees !== undefined;          // false
const statusChanged = params.status !== undefined && params.status !== prevStatus; // true（working → completed）
const forceSync = params.agentId !== undefined && params.status !== undefined;     // false（agentId なし）

if (assigneesChanged || statusChanged || forceSync) {
  await syncMaidYaml(projectPath, task, params, prevAssignees);
}
```

`statusChanged = true` のため `syncMaidYaml` は呼ばれる。
ただし、**担当メイドへの通知がない**（WebSocket は送られるが、メイドのターミナルには届かない）。

### 根本原因 C: `subStatus=completed` 経由での syncMaidYaml 漏れ

メイド長が `maidctl set task ID --subStatus completed` を実行した場合:
- `PATCH /api/tasks/:id {subStatus: "completed"}` → `params.status = undefined`
- `statusChanged = false`、`forceSync = false`
- → **`syncMaidYaml` が呼ばれない**

この経路では maid yaml が全く更新されない。

---

## 4. 業務影響

maid yaml の `status` が `working` のまま残ると:

1. **新タスク割り当てがブロックされる**（`assign-task.ts:46-53`）:
   ```typescript
   if (maidTask.status === "working") {
     return { success: false, error: `${targetAgent} は現在作業中です` };
   }
   ```
2. **`maidctl get team` でチーム状況が不正確**（稼働中に見える）
3. **メイド長が手動で `maidctl notify` を実行する運用が必要** → 暫定回避ルール化している

---

## 5. 改修案

### 案1: `checkAndAutoCloseParent` を `executeUpdateTask` 経由に変更【推奨】

**変更ファイル**: `task-auto-close.ts`

**方針**: `withTasksLock` 直接更新を廃止し、`executeUpdateTask` 経由で完了化する。

```typescript
// 変更前（直接 tasks.yaml を書き換え）
await withTasksLock(projectPath, async (lockData) => {
  parentTask.mainStatus = "closed";
  parentTask.status = "completed";
  ...
});

// 変更後（executeSideEffects を含む完全なパス経由）
// ※ ただし、checkAndAutoCloseParent は executeUpdateTask から呼ばれているため
//   デッドロック回避が必要（ロック解放後に外部呼び出し）
```

**問題**: `checkAndAutoCloseParent` は `executeUpdateTask` の内部から呼ばれるため、
再帰呼び出しになりデッドロックリスクがある。

**回避策**: `executeUpdateTask` のフロー終了後に、自動クローズされた親タスクに対して
別途 `syncMaidYaml` を呼ぶ「後処理フック」を追加する。

**実装イメージ**:
```typescript
// task-crud-update.ts（executeUpdateTask 末尾）
if (isCompleted && autoCloseResult.autoClosedIds.length > 0) {
  for (const autoClosedId of autoCloseResult.autoClosedIds) {
    await syncMaidYamlForTask(projectPath, autoClosedId);
  }
}
```

`syncMaidYamlForTask`: tasks.yaml からタスクを読み込み、担当メイドの maid yaml を更新する公開関数。

**実装規模**: task-auto-close.ts + task-crud-update.ts + task-side-effects.ts で 約30-50行の変更  
**トレードオフ**:
- ✅ 副作用処理を統一パスで実行
- ✅ archiveReport 等の他の副作用も正しく実行される
- ⚠️ デッドロック回避のため設計が複雑になる
- ⚠️ `executeSideEffects` の一部をモジュール外公開する必要がある

---

### 案2: `STATUS_MAP` に `completed → idle` を追加 + sync 呼び出し条件修正

**変更ファイル**: `task-side-effects.ts`

**方針**: 2つの小修正で問題の大部分を解消する。

**変更1: STATUS_MAP の修正**（task-side-effects.ts:207-211）
```typescript
// 変更前
const STATUS_MAP: Record<string, MaidTaskStatus> = {
  pending: "idle",
  cancelled: "idle",
};

// 変更後（completed時にメイドを idle にリセット）
const STATUS_MAP: Record<string, MaidTaskStatus> = {
  pending: "idle",
  cancelled: "idle",
  completed: "idle", // タスク完了 → メイドを idle（受け入れ可能）に戻す
};
```

**変更2: subStatus 経由での sync 漏れ修正**（task-side-effects.ts:376-380）
```typescript
// 変更前
const statusChanged = params.status !== undefined && params.status !== prevStatus;

// 変更後（subStatus=completed も検知）
const isCompletionBySubStatus =
  params.subStatus === "completed" || params.subStatus === "archived";
const statusChanged =
  (params.status !== undefined && params.status !== prevStatus) ||
  isCompletionBySubStatus;
```

**実装規模**: task-side-effects.ts で 約10-15行の変更  
**トレードオフ**:
- ✅ 最小変更、リスクが低い
- ✅ subStatus 経由の漏れも解消
- ⚠️ 根本原因 A（checkAndAutoCloseParent のスキップ）は解消されない
  - → `syncMaidYaml` 自体が呼ばれないため、STATUS_MAP の変更は無効
- ⚠️ maid yaml の history に "completed" が残らなくなる（idle 上書き）

---

### 案3: `review_waiting` substatus 導入

**変更ファイル**: 広範（maidctl.sh + types + routes + services）

**方針**: 実装完了後のレビュー待ち状態を専用の substatus で管理し、
`working` の占有を解消する。

```
working → review_waiting → (別メイドがレビュー) → completed
                        ↘ (問題あり) → working（修正対応）
```

メイドが実装完了時:
```bash
maidctl set my-status blocked --substatus review_waiting
```

メイド長がタスクを completed 化した際、`review_waiting` のメイドを自動的に `idle` に更新。

**実装規模**: 広範囲（types の substatus 定義、maidctl バリデーション、routes、services）で 約100行以上の変更  
**トレードオフ**:
- ✅ 「レビュー待ち」状態が明示化され、作業中と区別できる
- ✅ `working` の占有が解消（新タスク割り当て可能）
- ✅ チーム状況の可視性が向上
- ⚠️ 変更範囲が広く、既存フローへの影響が大きい
- ⚠️ メイドの運用フロー変更が必要（CLAUDE.md / maid-operation スキル更新）
- ⚠️ 既存タスクとの互換性（substatus 値の追加）

---

### 案4: 完了化トリガーでの担当メイド通知

**変更ファイル**: `task-side-effects.ts` + `task-auto-close.ts`

**方針**: タスクが completed になった際、担当メイドに `maidctl notify` 相当の通知を送る。

現在の問題の別側面（通知がない）を解消する追加改修として位置付ける。

```typescript
// executeSideEffects 内（task-side-effects.ts）
if (isCompleted && task.assignees.length > 0) {
  for (const assignee of task.assignees) {
    // WebSocket経由でメイドのターミナルに通知
    // または maid-notify スクリプトを呼び出し
  }
}
```

**実装規模**: 約20-30行の変更  
**トレードオフ**:
- ✅ メイドが「タスクが完了した」ことを自動で認識できる
- ⚠️ maid-agent-messenger から外部スクリプト（maid-notify）を呼ぶ依存が生まれる
- ⚠️ 通知インフラの結合度が上がる
- ⚠️ 状態の問題（maid yaml が更新されない）は別途解消が必要

---

## 6. 推奨案

**段階的対応を推奨**:

### P1（一次改修）: 案1 + 案2 の組み合わせ

**目的**: 状態の問題（maid yaml が更新されない）を解消する。

1. **案2の変更2**（subStatus=completed 経由の sync 漏れ修正）: `task-side-effects.ts` の `statusChanged` 条件を修正（10行以内）
2. **案1の後処理フック**: `executeUpdateTask` の末尾で `checkAndAutoCloseParent` が返した `autoClosedIds` に対して `syncMaidYamlForTask` を呼び出す（30-40行）

これにより：
- `PATCH /api/tasks/:id {status: "completed"}` 経由 → 既に動作（statusChanged=true）
- `PATCH /api/tasks/:id {subStatus: "completed"}` 経由 → 変更2で解消
- `checkAndAutoCloseParent` 経由の自動クローズ → 後処理フックで解消

### P2（二次改修）: 案3または案4

- 案3（review_waiting 導入）: 運用フローの明確化が主目的。実装規模は大きいが長期的に有益。
- 案4（完了化通知）: 通知の自動化。案3とは独立して実装可能。

---

## 7. P2-b「システム側で解消」思想との整合

ご主人様方針（memory: project_escalation_mechanism_issue.md）の「Git システム化（P2-b）と同じ
システム側で解消」思想との整合を確認する。

| 観点 | 現状 | 改修後（推奨案） |
|------|------|---------------|
| 人間依存 | メイド長が手動で `maidctl notify` | 自動（システムが maid yaml を更新） |
| 状態一貫性 | task.status と maid yaml が乖離 | 連動して更新 |
| 運用コスト | 毎回のタスク完了で手動対応が必要 | 不要 |
| 機構設計 | 副作用経路が複数あり、一部がスキップされる | 統一された副作用パスを通る |

→ **P1の改修でシステム側での自動解消が実現できる**。思想と整合している。

---

## 8. 実装規模感まとめ

| 案 | 変更ファイル数 | 変更行数（概算） | リスク |
|---|-------------|--------------|------|
| 案1後処理フック | 2-3ファイル | 30-50行 | 中（ロック設計に注意） |
| 案2変更2（sync条件修正） | 1ファイル | 10行以内 | 低 |
| 案3（review_waiting） | 5ファイル以上 | 100行以上 | 高 |
| 案4（完了化通知） | 1-2ファイル | 20-30行 | 中 |
| **P1推奨（案1後処理+案2変更2）** | **2-3ファイル** | **約40-60行** | **低〜中** |

---

## 9. 参考コード箇所

| 問題 | ファイル | 行番号 |
|------|--------|------|
| 自動クローズのスキップ | `task-auto-close.ts` | 253-264 |
| syncMaidYaml 呼び出し条件 | `task-side-effects.ts` | 376-380 |
| STATUS_MAP | `task-side-effects.ts` | 207-211 |
| PATCH /api/tasks/:id（agentId なし） | `task-api-routes.ts` | 131-153 |
| 新タスク割り当てガード | `assign-task.ts` | 46-53 |
