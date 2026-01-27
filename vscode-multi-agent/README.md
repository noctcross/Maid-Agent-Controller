# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
**multi-agent-shogun** の階層構造をVSCode上で再現します。

## 階層構造

```
┌─────────────────┐
│  🎩 執事        │ ← ユーザーからタスクを受け取り、分解
│  (Butler)       │
└────────┬────────┘
         │ サブタスクを指示
         ▼
┌─────────────────┐
│  👑 メイド長    │ ← サブタスクを各メイドに配分
│  (Chief Maid)   │
└────────┬────────┘
         │ 個別タスクを指示
         ▼
┌──┬──┬──┬──┬──┬──┬──┬──┐
│🎀│🎀│🎀│🎀│🎀│🎀│🎀│🎀│ ← 並列実行
│エ│ソ│リ│ロ│ア│メ│フ│ル│
│マ│フ│リ│｜│リ│イ│ロ│ナ│
│  │ィ│｜│ズ│ス│  │ラ│  │
│  │ア│  │  │  │  │  │  │
└──┴──┴──┴──┴──┴──┴──┴──┘
```

## 動作フロー

1. **ユーザー** → 執事にタスクを送信
2. **執事** → タスクを分析・サブタスクに分解 → メイド長に指示
3. **メイド長** → サブタスクを各メイドに配分
4. **メイド** → 個別タスクを実行 → 完了報告
5. **メイド長** → 結果を集約 → 執事に報告
6. **執事** → 全体の完了をユーザーに報告

## インストール

```bash
cd vscode-multi-agent
npm install
npm run compile
```

## 使い方

### 1. 起動

```
F5でデバッグ起動 → Extension Development Host が開く
```

### 2. エージェントを起動

コマンドパレット（`Ctrl+Shift+P`）から：

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Start All (10 Agents)` | 全員起動（執事+メイド長+メイド8人） |
| `Maid Agent: Start Butler (執事)` | 執事のみ起動 |
| `Maid Agent: Start Chief Maid (メイド長)` | メイド長のみ起動 |
| `Maid Agent: Start 8 Maids` | メイド8人を起動 |

### 3. タスクを送信

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Send Task to Butler` | 執事にタスクを送信（階層的に処理） |
| `Maid Agent: Send Task to Maid` | 特定のメイドに直接タスクを送信 |

### 4. ダッシュボード

- ステータスバーの「🎩 Maid Agent」をクリック
- または `Maid Agent: Show Dashboard`

## システムプロンプト

各エージェントには役割に応じたプロンプトが設定されます：

### 執事（タスク分解）
```
あなたは優秀な執事です。ご主人様から受けた指示を分析し、
メイドたちが実行できるサブタスクに分解してください。
...
最後に「メイド長、これらのタスクをメイドたちに配分してください」
```

### メイド長（タスク配分）
```
あなたはメイド長です。執事から受けたサブタスクを
各メイドに適切に配分し、進捗を管理してください。
...
全タスク完了後は「執事様、全タスクが完了いたしました」と報告
```

### メイド（タスク実行）
```
あなたは優秀なメイドです。メイド長から指示されたタスクを
丁寧に実行してください。
...
完了時は「お仕事完了でございます♪」と報告
```

## YAMLタスクファイル

`maid-tasks.yaml` を作成すると、自動的に執事に送信されます：

```yaml
tasks:
  - id: task-001
    description: "プロジェクト分析"
    prompt: |
      このプロジェクトを分析してください。
      - プロジェクトの構造
      - 主要なファイルと役割
      - 改善点や問題点
```

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Create Sample Task File` | サンプルYAMLを生成 |
| `Maid Agent: Start Watching Task File` | YAML監視開始 |
| `Maid Agent: Stop Watching Task File` | YAML監視停止 |

## multi-agent-shogun との違い

| 項目 | multi-agent-shogun | Maid Agent Controller |
|------|-------------------|----------------------|
| 環境 | tmux (Linux/macOS) | VSCode (クロスプラットフォーム) |
| ターミナル管理 | tmux send-keys | terminal.sendText() |
| 階層構造 | 将軍→家老→足軽 | 執事→メイド長→メイド |
| GUI | なし | Webviewダッシュボード |
| タスク管理 | YAML | YAML + ダッシュボード |

## 参考

- 元ネタ: [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)
- 記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- VSCode API: https://code.visualstudio.com/api

## ライセンス

MIT
