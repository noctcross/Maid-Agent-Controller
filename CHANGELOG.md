# Changelog

All notable changes to the Maid Agent Controller extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-05

### Added

- **maidctl CLI v3.0.0** - 統合管理コマンド
  - タスク管理: `maidctl create task`, `maidctl get tasks`, `maidctl set task`
  - ステータス更新: `maidctl set my-status`
  - 通知送信: `maidctl notify`
  - マイグレーション: `maidctl run migrate`
  - 動詞先行の統一構文（旧コマンドも後方互換で動作）

- **品質チェック機能**
  - LLM による報告書評価（Claude CLI 経由）
  - 成果物評価（変更ファイル内容の自動読み込み）
  - スコア閾値によるパス/フェイル判定

- **6スキル追加**
  - butler-operation, chief-operation, maid-operation
  - maidctl-reference, skill-creator, vscode-extension

- **2ルール追加**
  - rule-template（ルール作成用テンプレート）
  - reports-cleanup（報告書の整理ルール）

- **V2.1 タスク管理スキーマ**
  - 2層ステータス管理（mainStatus + subStatus）
  - タスク種別: task, work, step, investigation
  - サブステータス: pending, assigned, working, checkpoint, waiting, completed

- **roles/ ディレクトリ**
  - エージェントごとの専用ディレクトリ構造
  - CLAUDE.md による役割定義の参照

### Changed

- **フォルダ構造の刷新**
  - `agents/` → `core/` + `roles/` に分離
  - `agents/skills/` → `core/.claude/skills/` に移動
  - `core/.claude/rules/` にルールモジュール配置

- **Init コマンドの強化**
  - initGlobal: maidctl CLI、依存ツール（jq, yq, pm2）の自動セットアップ
  - init: core/ + roles/ 構造の自動作成、instructions の差分更新

### Removed

- **MCP サーバー廃止**
  - MCPツール（create_task, list_tasks 等）を廃止
  - maidctl CLI に統合

### Migration

V1 からの移行は [MIGRATION.md](docs/MIGRATION.md) を参照してください。

---

## [1.1.1] - 2026-02-18

### Fixed

- **macOS/Linux Init Global セットアップ問題の修正** (Issue #1)
  - 「完了」ボタン待ちの解消: ターミナル経由からバックグラウンド実行（execSync）に変更
  - ユーザー入力の一括取得: pm2 インストール時のパスワードをキャッシュし、pm2 startup 設定時に再利用
  - パスワードレス sudo 対応: `sudo -n` で自動実行可能な場合はユーザー入力なしで完了
  - パスワード入力リトライ: 最大3回までリトライ、失敗時は手動実行コマンドを案内
  - pm2 startup 設定の自動化: 確認ダイアログ後、バックグラウンドで自動実行

---

## [1.1.0] - 2026-02-12

### Added

- **Mac/Linux対応** (#148)
  - macOS および Linux ネイティブ環境でのセットアップ・実行をサポート
  - pm2-setup.ts に OS 分岐追加（WSL/ネイティブ自動切り替え）
  - tmux インストールの自動検出（brew/apt/dnf/pacman/zypper 対応）
  - settings.yaml に macOS/Linux 用スクリーンショットパス追加
  - テンプレート指示書に macOS BSD date 互換コマンド追記
  - file-routes.ts の WSL パス変換に OS 判定ガード追加
  - **注意**: 実装済みだが macOS/Linux 環境での動作は未検証

- **ダッシュボード モバイルレスポンシブ対応** (#160)
  - 500px 以下のモバイル表示に最適化
  - フィルタボタンの 2 列グリッド配置
  - 完了セクションのレイアウト改善

- **ダッシュボードトップページ** (#151, #152)
  - プロジェクト一覧表示機能
  - MCPツールの軽量化（summaryOnly オプション追加）

- **LLM モデル指定オプション** (#146)
  - settings.yaml によるモデル指定機能を追加
  - プロジェクトごとに使用する LLM モデルを設定可能

- **ドキュメント整備** (#149, #150)
  - ユーザーガイドを新規作成
  - 詳細なアンインストール手順書を追加
  - cleanup.sh によるクリーンアップ機能

### Changed

- **Instructions 自動更新機能** (#168)
  - Init 実行時に instructions の差分を自動検出
  - 変更があれば `instructions/backup/{filename}_YYYYMMDD_HHmmss.md` にバックアップ
  - 最新版で自動上書き、更新通知を表示
  - カスタム設定を適用するにはバックアップファイルを参照

- ダッシュボード HTML 生成ロジックを統一化 (#119)
  - task-html.ts に報告書リンク生成を共通関数化
  - VSCode 拡張メッセージハンドラを setupDashboardMessageHandler に共通化

- **ダッシュボード検索機能の改善** (#164)
  - サーバーサイドテキスト検索に改善

### Fixed

- **「本日完了」カウントの取りこぼし修正** (#138)
  - limit: 100 による取得上限で一部タスクがカウントされない問題を修正

- **報告書リンクのパス関連修正** (#116, #121)
  - WSL 環境でのパス変換バグを修正
  - isPathWithinRootCrossEnv で環境横断パス検証を追加
  - openFileWithPreview に WSL 環境パス正規化を追加

- **ダッシュボード検索のバグ修正** (#164)
  - タスク title/id の undefined に対する null safe 処理を追加

---

## [1.0.0] - 2026-02-09

### Added

- **VSCode拡張機能としての基本機能**
  - Maid Agent System の初期化・セットアップ (Init Global / Init Workspace)
  - tmux セッション管理 (Start/Stop/Restart)
  - MCP サーバー (maid-agent-messenger) の自動セットアップ
  - pm2 による MCP サーバーのプロセス管理

- **ダッシュボード機能**
  - Web ダッシュボードによるタスク管理・進捗確認
  - タスクのソート機能（更新日時、優先度、ステータス）(#083)
  - 相対時間表示（「5分前」など）
  - 報告書のプレビュー表示

- **MCP ツール**
  - create_task / list_tasks / get_task / update_task
  - assign_task / get_my_task / update_status
  - get_team_status / get_report

- **セキュリティ**
  - パストラバーサル防止
  - onclick 属性を addEventListener に移行 (#134)

- **テスト**
  - Express E2E テスト 67 件追加 (#095)

- **ドキュメント**
  - README 大幅更新（スクリーンショット、機能説明、セットアップガイド）(#108)
  - 謝辞セクション追加

### Changed

- MCPサーバー再起動処理の改善 (#120)
  - transport.onclose の無限再帰防止
  - max_memory_restart を settings.yaml から動的読み込み

### Fixed

- checkAndUpdateMcpJsonPath の移行ダイアログ表示修正 (#082)
- 対応まち欄「なし」重複表示バグ修正 (#113)
- completedSortField パラメータの VSCode 拡張機能経路追加 (#134)

---

## Notes

- **対応環境**: Windows (WSL2), macOS, Linux
- **必須要件**: VSCode 1.85.0 以上, Node.js 18 以上, tmux
- **MCP サーバー**: pm2 によるプロセス管理（自動起動対応）
