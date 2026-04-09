# iw-jira-cli

`iw-jira-cli` は Jira Cloud REST API v3 を操作する CLI ツールです。`setup` / `profile` による接続情報管理、課題操作、メンション対応コメント、`whoami` による接続確認を一貫した CLI フローで提供します。AI エージェント連携向けのコンパクト出力にも対応しています。

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![CLI](https://img.shields.io/badge/interface-CLI-4D4D4D)
![License](https://img.shields.io/badge/license-MIT-blue)

## Table of contents

* [Overview](#overview)
* [Features](#features)
* [Installation](#installation)
  + [Run with npx](#run-with-npx)
  + [Install globally](#install-globally)
  + [Run from source](#run-from-source)
* [Quick start](#quick-start)
* [Profiles](#profiles)
* [Environment variables](#environment-variables)
* [Authentication check](#authentication-check)
* [Credential precedence](#credential-precedence)
* [Usage](#usage)
  + [Show an issue](#show-an-issue)
  + [Search issues](#search-issues)
  + [Create an issue](#create-an-issue)
  + [Update an issue](#update-an-issue)
  + [Transition an issue](#transition-an-issue)
  + [Comments](#comments)
  + [User search](#user-search)
  + [Project list](#project-list)
* [Output format](#output-format)
* [Mention syntax](#mention-syntax)
* [Development](#development)
* [License](#license)

## Overview

`iw-jira-cli` は Jira 課題の取得、検索、更新、コメント、ステータス遷移を行うための CLI です。初回は `iw-jira-cli setup` で資格情報を保存し、その後は `issue` / `project` / `user` / `whoami` をそのまま使えます。

## Features

- 課題の取得・検索（JQL 対応）・作成・更新
- ステータス遷移（`issue transitions` / `issue transition`）
- コメントの取得・追加
- ユーザー検索（メンション用 accountId の確認）
- プロジェクト一覧
- `setup` / `profile` による接続情報管理
- 認証ユーザー情報の取得（`whoami`, `myself`）
- メンション記法: `@[accountId]` または `@[email:user@example.com]`
- パイプ・非 TTY 時の自動コンパクト出力（`JIRA_CLI_COMPACT` で制御可能）

## Installation

### Run with npx

```bash
npx @niiiiiiile/iw-jira-cli@latest
```

### Install globally

```bash
npm install -g @niiiiiiile/iw-jira-cli
```

### Run from source

```bash
git clone https://github.com/Niiiiile/jira-cli.git
cd iw-jira-cli
npm install
npm run build
```

## Quick start

```bash
iw-jira-cli setup \
  --host your-company.atlassian.net \
  --email your-email@example.com \
  --api-token your-api-token-here
```

初回登録時は `default` プロファイルに保存され、自動でデフォルトになります。

API トークンは [Atlassian アカウント設定](https://id.atlassian.com/manage-profile/security/api-tokens) から発行できます。

## Profiles

```bash
# work プロファイルを追加
iw-jira-cli profile add work \
  --host your-company.atlassian.net \
  --email your-email@example.com \
  --api-token your-api-token-here

# プロファイル一覧
iw-jira-cli profile list

# デフォルト切り替え
iw-jira-cli profile use work
```

## Environment variables

`.env.example` をコピーして `.env` を作成し、各値を設定してください。

```bash
cp .env.example .env
```

```env
JIRA_HOST=your-company.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token-here
```

環境変数はシェルに直接設定することも可能です:

```bash
export JIRA_HOST=your-company.atlassian.net
export JIRA_EMAIL=your-email@example.com
export JIRA_API_TOKEN=your-api-token-here
```

## Authentication check

```bash
iw-jira-cli whoami
```

既存の `iw-jira-cli myself` も引き続き利用できます。

## Credential precedence

1. コマンドフラグ（`--host`, `--email`, `--api-token`）
2. 設定ファイルのプロファイル（`--profile` または default）
3. 環境変数 / `.env`（`JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`）

## Usage

```bash
npx @niiiiiiile/iw-jira-cli@latest --help
```

### Show an issue

```bash
# キーで取得（show は issue get の短縮）
npx @niiiiiiile/iw-jira-cli@latest show PROJECT-123

# URL でも指定可
npx @niiiiiiile/iw-jira-cli@latest show https://your-company.atlassian.net/browse/PROJECT-123
```

グローバルインストール済みの場合は `iw-jira-cli` コマンドとして呼び出せます。

### Search issues

```bash
# 自分にアサインされた未解決の課題（デフォルト）
iw-jira-cli issue search

# プロジェクトを指定
iw-jira-cli issue search PROJECT

# JQL で検索
iw-jira-cli issue search --jql "project = PROJECT AND status = 'In Progress'"

# 件数を指定
iw-jira-cli issue search PROJECT --limit 50
```

### Create an issue

```bash
iw-jira-cli issue create \
  --project PROJECT \
  --summary "バグ修正: ログイン画面のエラー" \
  --type Bug \
  --description "再現手順: ..." \
  --assignee email:user@example.com
```

### Update an issue

```bash
iw-jira-cli issue update PROJECT-123 \
  --summary "新しいタイトル" \
  --assignee email:user@example.com \
  --due-date 2026-04-30
```

### Transition an issue

```bash
# 利用可能な遷移を確認
iw-jira-cli issue transitions PROJECT-123

# 遷移名で変更（部分一致）
iw-jira-cli issue transition PROJECT-123 --name "In Progress"

# 遷移 ID で変更
iw-jira-cli issue transition PROJECT-123 --id 21
```

### Comments

```bash
# コメント一覧
iw-jira-cli issue comments PROJECT-123

# コメントを追加（メンション可）
iw-jira-cli issue comment PROJECT-123 --body "確認しました @[email:user@example.com]"
```

### User search

```bash
# メンション用 accountId を確認
iw-jira-cli user search "田中"
```

### Project list

```bash
iw-jira-cli project list
iw-jira-cli project list --query "my project"
```

## Output format

デフォルトは TOON 形式（人間向け）。NDJSON に切り替えるには `--format jsonl` を指定します。

```bash
jira-cli issue search PROJECT --format jsonl
```

### コンパクト出力

パイプや非 TTY 環境では自動的にコンパクト出力になります（AI エージェント向けのトークン削減）。

```bash
# 強制的にコンパクト出力
JIRA_CLI_COMPACT=1 iw-jira-cli issue search PROJECT

# 強制的にフル出力
JIRA_CLI_COMPACT=0 iw-jira-cli issue search PROJECT
```

## Mention syntax

説明文・コメントで以下の記法でメンションを指定できます。

| 記法 | 説明 |
|------|------|
| `@[712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]` | accountId で直接指定 |
| `@[email:user@example.com]` | メールアドレスで指定（内部で accountId に解決） |

accountId は `iw-jira-cli user search <名前>` で確認できます。

## Development

```bash
# 依存関係のインストール
npm install

# TypeScript のビルド
npm run build

# ビルドなしで直接実行（開発時）
npm run dev -- issue search
```

## ライセンス

MIT
