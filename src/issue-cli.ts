import { Cli, z } from 'incur'
import { plainTextFromAdf } from './adf.js'
import { descriptionToAdf } from './adf-mentions.js'
import { resolveCredentials, type JiraCredentials } from './config.js'
import { ISSUE_DETAIL_FIELDS, ISSUE_LIST_FIELDS } from './issue-fields.js'
import { jiraRequest, toIssueSummary, type IssueSummary } from './jira-client.js'
import {
  slimComments,
  slimCreate,
  slimIssueEnvelope,
  slimSearch,
  slimTransitions,
  slimUpdate,
} from './agent-compact.js'
import { finalizeCompactOutput } from './output.js'
import { parseIssueKey, parseProjectRef } from './parse-jira-input.js'
import { authOptions } from './shared.js'

const DEFAULT_JQL = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC'

/**
 * accountId または "email:user@example.com" 形式から accountId を解決する。
 * "none" は null（割当解除）を意味するため呼び出し元で事前に除外すること。
 */
async function resolveAssigneeAccountId(
  jiraEnv: JiraCredentials,
  assignee: string,
): Promise<string> {
  const emailPrefix = /^email:/i
  if (emailPrefix.test(assignee)) {
    const email = assignee.replace(emailPrefix, '').trim()
    if (!email) throw new Error('--assignee email:... にメールアドレスがありません')
    const users = await jiraRequest<
      Array<{ accountId: string; emailAddress?: string; displayName?: string }>
    >(jiraEnv, `/user/search?query=${encodeURIComponent(email)}&maxResults=25`)
    const exact = users.find((u) => u.emailAddress?.toLowerCase() === email.toLowerCase())
    const u = exact ?? users[0]
    if (!u) throw new Error(`ユーザーが見つかりません: ${email}`)
    return u.accountId
  }
  return assignee
}

export async function loadIssueSummary(
  env: JiraCredentials,
  ref: string,
): Promise<{ issue: IssueSummary }> {
  const key = parseIssueKey(ref)
  const fields = [...ISSUE_DETAIL_FIELDS].join(',')
  const raw = await jiraRequest<{
    key: string
    id: string
    self: string
    fields?: Record<string, unknown>
  }>(env, `/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`)
  return { issue: toIssueSummary(raw) }
}

function resolveSearchJql(opts: {
  jql: string | undefined
  /** --project（第1引数 target より優先） */
  project: string | undefined
  /** 位置引数: キーまたは URL */
  target: string | undefined
}): string {
  if (opts.jql !== undefined && opts.jql.length > 0) return opts.jql
  const pRaw = opts.project?.trim() || opts.target?.trim()
  if (pRaw) {
    const p = parseProjectRef(pRaw)
    return `project = ${p} ORDER BY updated DESC`
  }
  return DEFAULT_JQL
}

export const issueCli = Cli.create('issue', {
  description:
    '課題の取得・検索・作成・コメント。説明・コメントで @[accountId] / @[email:...] メンション可。user search で accountId 確認',
})
  .command('get', {
    description: '課題を1件取得（キー WEC-41 または browse URL など）',
    args: z.object({
      ref: z
        .string()
        .describe('課題キー（WEC-41）または URL（.../browse/WEC-41、selectedIssue= 付きボード URL 等）'),
    }),
    options: authOptions,
    output: z.any(),
    async run(c) {
      const full = await loadIssueSummary(resolveCredentials(c.options), c.args.ref)
      return finalizeCompactOutput(c, full.issue, (issue) => slimIssueEnvelope(issue, true))
    },
  })
  .command('search', {
    description: 'JQL enhanced search。第1引数にプロジェクトキーまたはボード URL も可',
    args: z.object({
      target: z
        .string()
        .optional()
        .describe('プロジェクトキー（WEC）または .../projects/WEC/... の URL（--project 未指定時）'),
    }),
    options: z.object({
      jql: z.string().optional().describe('JQL（最優先）'),
      project: z
        .string()
        .optional()
        .describe('プロジェクトキーまたは URL（第1引数より優先）'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('最大件数'),
      nextPageToken: z
        .string()
        .optional()
        .describe('前回レスポンスの nextPageToken（ページング）'),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const creds = resolveCredentials(c.options)
      const jql = resolveSearchJql({
        jql: c.options.jql,
        project: c.options.project,
        target: c.args.target,
      })
      const body: Record<string, unknown> = {
        jql,
        maxResults: c.options.limit,
        fields: [...ISSUE_LIST_FIELDS],
      }
      if (c.options.nextPageToken) {
        body.nextPageToken = c.options.nextPageToken
      }
      const res = await jiraRequest<{
        isLast?: boolean
        nextPageToken?: string
        issues: Array<{ key: string; id: string; self: string; fields?: Record<string, unknown> }>
      }>(creds, '/search/jql', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const full = {
        count: res.issues.length,
        isLast: res.isLast,
        nextPageToken: res.nextPageToken ?? null,
        issues: res.issues.map((i) => toIssueSummary(i)),
        jql,
      }
      return finalizeCompactOutput(c, full, (data) => slimSearch(data, true))
    },
  })
  .command('create', {
    description: '課題を作成',
    options: z.object({
      project: z
        .string()
        .min(1)
        .describe('プロジェクトキー（WEC）または .../projects/WEC/... の URL'),
      summary: z.string().min(1).describe('要約'),
      type: z.string().default('Task').describe('課題タイプ名（例: Task, Bug, Story）'),
      description: z
        .string()
        .optional()
        .describe(
          '説明（改行可）。メンション: @[712020:uuid...] または @[email:user@example.com]（user search で確認）',
        ),
      parent: z
        .string()
        .optional()
        .describe('親 Issue キー（INT1-110）または URL（Epic リンク・サブタスク親）'),
      assignee: z
        .string()
        .optional()
        .describe('担当者 accountId または email:user@example.com'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切り、例: bug,backend）'),
      priority: z
        .string()
        .optional()
        .describe('優先度名（例: Highest, High, Medium, Low, Lowest）'),
      'start-date': z
        .string()
        .optional()
        .describe('開始日（YYYY-MM-DD）'),
      'due-date': z
        .string()
        .optional()
        .describe('期日（YYYY-MM-DD）'),
      'story-points': z
        .string()
        .optional()
        .describe(
          'Story Points（数値）。デフォルトで customfield_10038 にマップ。env JIRA_STORY_POINTS_FIELD で上書き可',
        ),
      'fields-json': z
        .string()
        .optional()
        .describe(
          '任意フィールドを JSON で上書き（例: \'{"customfield_10100":{"value":"Low"},"customfield_10038":3}\'）',
        ),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const creds = resolveCredentials(c.options)
      const projectKey = parseProjectRef(c.options.project)
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary: c.options.summary,
        issuetype: { name: c.options.type },
      }
      if (c.options.description !== undefined && c.options.description.length > 0) {
        fields.description = await descriptionToAdf(creds, c.options.description)
      }
      if (c.options.parent !== undefined && c.options.parent.length > 0) {
        fields.parent = { key: parseIssueKey(c.options.parent) }
      }
      if (c.options.assignee !== undefined && c.options.assignee.length > 0) {
        const accountId = await resolveAssigneeAccountId(creds, c.options.assignee)
        fields.assignee = { accountId }
      }
      if (c.options.labels !== undefined && c.options.labels.length > 0) {
        fields.labels = c.options.labels.split(',').map((s) => s.trim()).filter(Boolean)
      }
      if (c.options.priority !== undefined && c.options.priority.length > 0) {
        fields.priority = { name: c.options.priority }
      }
      if (c.options['start-date'] !== undefined && c.options['start-date'].length > 0) {
        fields.customfield_10015 = c.options['start-date']
      }
      if (c.options['due-date'] !== undefined && c.options['due-date'].length > 0) {
        fields.duedate = c.options['due-date']
      }
      if (c.options['story-points'] !== undefined && c.options['story-points'].length > 0) {
        const fieldId = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10038'
        const raw = c.options['story-points']
        const num = Number(raw)
        if (Number.isNaN(num)) {
          throw new Error(`--story-points は数値で指定してください: "${raw}"`)
        }
        fields[fieldId] = num
      }
      if (c.options['fields-json'] !== undefined && c.options['fields-json'].length > 0) {
        let extra: unknown
        try {
          extra = JSON.parse(c.options['fields-json'])
        } catch (e) {
          throw new Error(`--fields-json が正しい JSON ではありません: ${(e as Error).message}`)
        }
        if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) {
          throw new Error('--fields-json は JSON オブジェクトで指定してください')
        }
        Object.assign(fields, extra as Record<string, unknown>)
      }
      const created = await jiraRequest<{ key: string; id: string; self: string }>(
        creds,
        '/issue',
        {
          method: 'POST',
          body: JSON.stringify({ fields }),
        },
      )
      const full = { key: created.key, id: created.id, self: created.self }
      return finalizeCompactOutput(c, full, (data) => slimCreate(data, true))
    },
  })
  .command('update', {
    description: 'Issue を更新（summary / description / assignee / parent / labels / priority）',
    args: z.object({
      ref: z.string().describe('課題キー（WEC-41）または URL'),
    }),
    options: z.object({
      summary: z.string().optional().describe('新しい要約'),
      description: z
        .string()
        .optional()
        .describe('新しい説明（改行可・@[...] メンション可。空文字でクリア）'),
      assignee: z
        .string()
        .optional()
        .describe('担当者 accountId または email:user@example.com（"none" で未割当）'),
      parent: z
        .string()
        .optional()
        .describe('親 Issue キー（INT1-110）または URL（"none" でクリア）'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切り。空文字でリセット）'),
      priority: z
        .string()
        .optional()
        .describe('優先度名（例: Highest, High, Medium, Low, Lowest）'),
      'start-date': z
        .string()
        .optional()
        .describe('開始日（YYYY-MM-DD。"none" でクリア）'),
      'due-date': z
        .string()
        .optional()
        .describe('期日（YYYY-MM-DD。"none" でクリア）'),
      'story-points': z
        .string()
        .optional()
        .describe(
          'Story Points（数値。"none" でクリア）。デフォルトで customfield_10038 にマップ。env JIRA_STORY_POINTS_FIELD で上書き可',
        ),
      'fields-json': z
        .string()
        .optional()
        .describe(
          '任意フィールドを JSON で上書き（例: \'{"customfield_10100":{"value":"Low"}}\'、null を含められる）',
        ),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const creds = resolveCredentials(c.options)
      const key = parseIssueKey(c.args.ref)
      const fields: Record<string, unknown> = {}

      if (c.options.summary !== undefined) {
        fields.summary = c.options.summary
      }
      if (c.options.description !== undefined) {
        fields.description =
          c.options.description.length > 0
            ? await descriptionToAdf(creds, c.options.description)
            : null
      }
      if (c.options.assignee !== undefined) {
        if (c.options.assignee === 'none') {
          fields.assignee = null
        } else {
          const accountId = await resolveAssigneeAccountId(creds, c.options.assignee)
          fields.assignee = { accountId }
        }
      }
      if (c.options.parent !== undefined) {
        if (c.options.parent === 'none') {
          fields.parent = null
        } else {
          fields.parent = { key: parseIssueKey(c.options.parent) }
        }
      }
      if (c.options.labels !== undefined) {
        fields.labels = c.options.labels
          ? c.options.labels.split(',').map((s) => s.trim()).filter(Boolean)
          : []
      }
      if (c.options.priority !== undefined) {
        fields.priority = c.options.priority === 'none' ? null : { name: c.options.priority }
      }
      if (c.options['start-date'] !== undefined) {
        fields.customfield_10015 =
          c.options['start-date'] === 'none' ? null : c.options['start-date']
      }
      if (c.options['due-date'] !== undefined) {
        fields.duedate = c.options['due-date'] === 'none' ? null : c.options['due-date']
      }
      if (c.options['story-points'] !== undefined) {
        const fieldId = process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10038'
        if (c.options['story-points'] === 'none') {
          fields[fieldId] = null
        } else {
          const num = Number(c.options['story-points'])
          if (Number.isNaN(num)) {
            throw new Error(`--story-points は数値で指定してください: "${c.options['story-points']}"`)
          }
          fields[fieldId] = num
        }
      }
      if (c.options['fields-json'] !== undefined && c.options['fields-json'].length > 0) {
        let extra: unknown
        try {
          extra = JSON.parse(c.options['fields-json'])
        } catch (e) {
          throw new Error(`--fields-json が正しい JSON ではありません: ${(e as Error).message}`)
        }
        if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) {
          throw new Error('--fields-json は JSON オブジェクトで指定してください')
        }
        Object.assign(fields, extra as Record<string, unknown>)
      }

      if (Object.keys(fields).length === 0) {
        throw new Error('更新するフィールドを少なくとも1つ指定してください')
      }

      await jiraRequest(creds, `/issue/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      })
      const full = { ok: true as const, key }
      return finalizeCompactOutput(c, full, (data) => slimUpdate(data, true))
    },
  })
  .command('transitions', {
    description: 'Issue の利用可能なステータス遷移一覧を取得',
    args: z.object({
      ref: z.string().describe('課題キー（WEC-41）または URL'),
    }),
    options: authOptions,
    output: z.any(),
    async run(c) {
      const key = parseIssueKey(c.args.ref)
      const creds = resolveCredentials(c.options)
      const res = await jiraRequest<{
        transitions: Array<{
          id: string
          name: string
          to?: { name?: string }
        }>
      }>(creds, `/issue/${encodeURIComponent(key)}/transitions`)
      const full = {
        key,
        transitions: res.transitions.map((t) => ({
          id: t.id,
          name: t.name,
          toStatus: t.to?.name ?? '',
        })),
      }
      return finalizeCompactOutput(c, full, (data) => slimTransitions(data, true))
    },
  })
  .command('transition', {
    description: 'Issue のステータスを遷移させる（transitions で id/名前を確認）',
    args: z.object({
      ref: z.string().describe('課題キー（WEC-41）または URL'),
    }),
    options: z.object({
      id: z
        .string()
        .optional()
        .describe('遷移 ID（transitions コマンドで確認）'),
      name: z
        .string()
        .optional()
        .describe('遷移名の部分一致（例: "In Progress", "完了"）。--id 未指定時に使用'),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const key = parseIssueKey(c.args.ref)
      const creds = resolveCredentials(c.options)

      if (!c.options.id && !c.options.name) {
        throw new Error('--id または --name を指定してください')
      }

      let transitionId = c.options.id
      if (!transitionId) {
        const res = await jiraRequest<{
          transitions: Array<{ id: string; name: string }>
        }>(creds, `/issue/${encodeURIComponent(key)}/transitions`)
        const nameLower = c.options.name!.toLowerCase()
        const found = res.transitions.find((t) =>
          t.name.toLowerCase().includes(nameLower),
        )
        if (!found) {
          const names = res.transitions.map((t) => `"${t.name}"(id=${t.id})`).join(', ')
          throw new Error(`遷移が見つかりません: "${c.options.name}". 候補: ${names}`)
        }
        transitionId = found.id
      }

      await jiraRequest(creds, `/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transitionId } }),
      })
      const full = { ok: true as const, key, transitionId }
      return finalizeCompactOutput(c, full, (data) => ({
        ok: true,
        k: data.key,
        tid: data.transitionId,
      }))
    },
  })
  .command('comments', {
    description: '課題のコメント一覧（キーまたは browse URL）',
    args: z.object({
      ref: z.string().describe('課題キー（WEC-41）または課題 URL'),
    }),
    options: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50).describe('最大件数'),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const key = parseIssueKey(c.args.ref)
      const creds = resolveCredentials(c.options)
      const res = await jiraRequest<{
        total: number
        comments: Array<{
          id: string
          author?: { displayName?: string }
          created: string
          body?: unknown
        }>
      }>(creds, `/issue/${encodeURIComponent(key)}/comment?maxResults=${c.options.limit}`)
      const full = {
        key,
        total: res.total,
        comments: res.comments.map((co) => ({
          id: co.id,
          author: co.author?.displayName ?? '',
          created: co.created,
          body:
            typeof co.body === 'string'
              ? co.body.trim()
              : co.body != null && typeof co.body === 'object'
                ? plainTextFromAdf(co.body).trim()
                : '',
        })),
      }
      return finalizeCompactOutput(c, full, (data) => slimComments(data, true))
    },
  })
  .command('comment', {
    description: 'コメントを追加（メンション: @[accountId] または @[email:...]）',
    args: z.object({
      ref: z.string().describe('課題キーまたは URL'),
    }),
    options: z.object({
      body: z.string().min(1).describe('本文（改行可・@[...] メンション可）'),
      ...authOptions.shape,
    }),
    output: z.any(),
    async run(c) {
      const key = parseIssueKey(c.args.ref)
      const creds = resolveCredentials(c.options)
      const body = await descriptionToAdf(creds, c.options.body)
      const created = await jiraRequest<{ id: string; self: string }>(
        creds,
        `/issue/${encodeURIComponent(key)}/comment`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        },
      )
      const full = { ok: true as const, key, id: created.id, self: created.self }
      return finalizeCompactOutput(c, full, (data) => ({ ok: true, k: data.key, id: data.id }))
    },
  })
