import { Cli, z } from 'incur'
import { slimUsers } from './agent-compact.js'
import { resolveCredentials } from './config.js'
import { jiraRequest } from './jira-client.js'
import { finalizeCompactOutput } from './output.js'
import { authOptions } from './shared.js'

export const userCli = Cli.create('user', {
  description: 'ユーザー検索（メンション用 accountId の確認など）',
}).command('search', {
  description: '表示名・メールの部分一致で検索（GET /user/search）',
  args: z.object({
    query: z.string().min(1).describe('検索語（メール・名前の一部）'),
  }),
  options: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(15).describe('最大件数'),
    ...authOptions.shape,
  }),
  output: z.any(),
  async run(c) {
    const creds = resolveCredentials(c.options)
    const users = await jiraRequest<
      Array<{
        accountId: string
        displayName?: string
        emailAddress?: string
        active?: boolean
      }>
    >(creds, `/user/search?query=${encodeURIComponent(c.args.query)}&maxResults=${c.options.limit}`)
    const list = users.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName ?? '',
      emailAddress: u.emailAddress ?? '',
      active: u.active,
      /** CLI メンション用プレースホルダー例 */
      mention: `@[${u.accountId}]`,
    }))
    const data = {
      count: list.length,
      users: list,
      hint: '本文では @[accountId] または @[email:mail@example.com] でメンションできます',
    }
    return finalizeCompactOutput(c, data, (value) => slimUsers(value, true))
  },
})
