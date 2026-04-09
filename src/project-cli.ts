import { Cli, z } from 'incur'
import { slimProjects } from './agent-compact.js'
import { resolveCredentials } from './config.js'
import { jiraRequest } from './jira-client.js'
import { finalizeCompactOutput } from './output.js'
import { authOptions } from './shared.js'

export const projectCli = Cli.create('project', {
  description: 'プロジェクトの検索・一覧（非TTY 時は圧縮出力）',
}).command('list', {
  description: 'アクセス可能なプロジェクトを検索',
  options: z.object({
    query: z.string().optional().describe('名前・キーに対する部分一致（省略時は広く取得）'),
    limit: z.coerce.number().int().min(1).max(100).default(50).describe('最大件数'),
    ...authOptions.shape,
  }),
  output: z.any(),
  async run(c) {
    const q = new URLSearchParams()
    const creds = resolveCredentials(c.options)
    q.set('maxResults', String(c.options.limit))
    if (c.options.query !== undefined && c.options.query.length > 0) {
      q.set('query', c.options.query)
    }
    const res = await jiraRequest<{
      values: Array<{
        key: string
        id: string
        name: string
        projectTypeKey: string
      }>
    }>(creds, `/project/search?${q.toString()}`)
    const full = {
      count: res.values.length,
      projects: res.values.map((p) => ({
        key: p.key,
        id: p.id,
        name: p.name,
        projectTypeKey: p.projectTypeKey,
      })),
    }
    return finalizeCompactOutput(c, full, (data) => slimProjects(data, true))
  },
  })
