@echo off
REM maidctl.cmd - Windows用ラッパー
REM Git for Windows の bash.exe 経由で maidctl (bashスクリプト) を実行する
REM
REM 前提: Git for Windows がインストール済みで bash.exe が PATH に存在すること
REM       (psmux戦略の必須要件)

REM UTF-8コードページに切り替え（日本語出力の文字化け防止）
chcp 65001 >nul 2>nul

where bash >nul 2>nul
if errorlevel 1 (
    echo [maidctl] エラー: bash.exe が見つかりません。 1>&2
    echo [maidctl] Git for Windows をインストールしてください。 1>&2
    exit /b 1
)

bash "%~dp0maidctl" %*
