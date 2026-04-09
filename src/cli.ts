#!/usr/bin/env node
import { Cli, z } from 'incur'
import { slimIssueEnvelope, slimMyself } from './agent-compact.js'
import { bootstrapCli } from './bootstrap.js'
import { DEFAULT_PROFILE_NAME, readConfig, resolveCredentials, writeConfig } from './config.js'
import { jiraRequest } from './jira-client.js'
import { finalizeCompactOutput } from './output.js'
import { issueCli, loadIssueSummary } from './issue-cli.js'
import { profileCli } from './profile-cli.js'
import { projectCli } from './project-cli.js'
import { authOptions } from './shared.js'
import { userCli } from './user-cli.js'

bootstrapCli()

async function loadMyself(
  opts: {
    profile?: string
    host?: string
    email?: string
    apiToken?: string
  },
) {
  const creds = resolveCredentials(opts)
  return jiraRequest<{
    accountId: string
    displayName: string
    emailAddress?: string
    active?: boolean
  }>(creds, '/myself')
}

Cli.create('iw-jira-cli', {
  description:
    'Jira Cloud REST API v3 用 CLI。setup/profile、キー／URL、メンション（@[accountId] / @[email:...]）、JIRA_CLI_COMPACT 対応。出力は TOON（--format jsonl で NDJSON に切替）',
  version: '0.5.0',
  format: 'toon',
})
  .command('show', {
    description: '課題を1件表示（`issue get` の短縮。キーまたは browse URL）',
    args: z.object({
      ref: z.string().describe('WEC-41 または .../browse/WEC-41 等'),
    }),
    options: authOptions,
    output: z.any(),
    async run(c) {
      const full = await loadIssueSummary(resolveCredentials(c.options), c.args.ref)
      return finalizeCompactOutput(c, full.issue, (issue) => slimIssueEnvelope(issue, true))
    },
  })
  .command('setup', {
    description: '初回セットアップ向けにプロファイルを保存',
    options: z.object({
      profile: z
        .string()
        .optional()
        .describe(`保存先プロファイル名（省略時: ${DEFAULT_PROFILE_NAME}）`),
      host: z.string().describe('Jira サイトホストまたは URL'),
      email: z.string().email().describe('Atlassian アカウントのメール'),
      apiToken: z.string().describe('Jira API トークン'),
      default: z.boolean().optional().describe('このプロファイルをデフォルトに設定'),
    }),
    run(c) {
      const config = readConfig()
      const name = c.options.profile ?? DEFAULT_PROFILE_NAME
      config.profiles[name] = {
        host: c.options.host.trim(),
        email: c.options.email.trim(),
        apiToken: c.options.apiToken.trim(),
      }
      const isFirst = Object.keys(config.profiles).length === 1
      if (c.options.default || isFirst || !config.default) {
        config.default = name
      }
      writeConfig(config)
      return {
        saved: name,
        isDefault: config.default === name,
        hint: '接続確認は `iw-jira-cli whoami` を実行してください',
      }
    },
  })
  .command(issueCli)
  .command(projectCli)
  .command(profileCli)
  .command(userCli)
  .command('myself', {
    description: '認証ユーザー情報を取得',
    options: authOptions,
    output: z.any(),
    async run(c) {
      const me = await loadMyself(c.options)
      const full = {
        accountId: me.accountId,
        displayName: me.displayName,
        emailAddress: me.emailAddress,
        active: me.active,
      }
      return finalizeCompactOutput(c, full, (data) => slimMyself(data, true))
    },
  })
  .command('whoami', {
    description: '認証ユーザー情報を取得（`myself` の別名）',
    options: authOptions,
    output: z.any(),
    async run(c) {
      const me = await loadMyself(c.options)
      const full = {
        accountId: me.accountId,
        displayName: me.displayName,
        emailAddress: me.emailAddress,
        active: me.active,
      }
      return finalizeCompactOutput(c, full, (data) => slimMyself(data, true))
    },
  })
  .serve()
