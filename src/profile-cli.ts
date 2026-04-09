import { Cli, z } from 'incur'
import { readConfig, writeConfig } from './config.js'

export const profileCli = Cli.create('profile', {
  description: 'プロファイル管理（Jira サイト接続情報）',
})

profileCli.command('list', {
  description: '設定済みプロファイルの一覧を表示',
  examples: [{ description: '登録済みプロファイルとデフォルトを確認' }],
  run() {
    const config = readConfig()
    const profiles = Object.entries(config.profiles).map(([name, profile]) => ({
      name,
      host: profile.host,
      email: profile.email,
      isDefault: name === config.default,
    }))
    return {
      default: config.default ?? null,
      profiles,
    }
  },
})

profileCli.command('add', {
  description: 'プロファイルを追加・更新',
  args: z.object({
    name: z.string().describe('プロファイル名（例: work, personal）'),
  }),
  options: z.object({
    host: z.string().describe('Jira サイトホストまたは URL'),
    email: z.string().email().describe('Atlassian アカウントのメール'),
    apiToken: z.string().describe('Jira API トークン'),
    default: z.boolean().optional().describe('このプロファイルをデフォルトに設定'),
  }),
  examples: [
    {
      args: { name: 'work' },
      options: {
        host: 'your-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'YOUR_API_TOKEN',
      },
      description: 'work プロファイルを追加（初回登録時は自動でデフォルトになる）',
    },
  ],
  run(c) {
    const config = readConfig()
    config.profiles[c.args.name] = {
      host: c.options.host.trim(),
      email: c.options.email.trim(),
      apiToken: c.options.apiToken.trim(),
    }
    const isFirst = Object.keys(config.profiles).length === 1
    if (c.options.default || isFirst || !config.default) {
      config.default = c.args.name
    }
    writeConfig(config)
    return {
      added: c.args.name,
      isDefault: config.default === c.args.name,
    }
  },
})

profileCli.command('remove', {
  description: 'プロファイルを削除',
  args: z.object({
    name: z.string().describe('削除するプロファイル名'),
  }),
  run(c) {
    const config = readConfig()
    if (!config.profiles[c.args.name]) {
      return c.error({
        code: 'PROFILE_NOT_FOUND',
        message: `プロファイル "${c.args.name}" が見つかりません`,
        retryable: false,
        cta: { commands: ['iw-jira-cli profile list'] },
      })
    }
    delete config.profiles[c.args.name]
    if (config.default === c.args.name) {
      config.default = Object.keys(config.profiles)[0]
    }
    writeConfig(config)
    return { removed: c.args.name, newDefault: config.default ?? null }
  },
})

profileCli.command('use', {
  description: 'デフォルトプロファイルを変更',
  args: z.object({
    name: z.string().describe('デフォルトに設定するプロファイル名'),
  }),
  run(c) {
    const config = readConfig()
    if (!config.profiles[c.args.name]) {
      return c.error({
        code: 'PROFILE_NOT_FOUND',
        message: `プロファイル "${c.args.name}" が見つかりません`,
        retryable: false,
        cta: { commands: ['iw-jira-cli profile list'] },
      })
    }
    config.default = c.args.name
    writeConfig(config)
    return { default: c.args.name }
  },
})

