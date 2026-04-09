import type { IssueSummary } from './jira-client.js'

const DESC_MAX = 800
const COMMENT_BODY_MAX = 600

/** `JIRA_CLI_COMPACT`: 1/true=常に圧縮、0/false=常にフル、未設定=非TTY のときだけ圧縮 */
export function wantCompact(agent: boolean): boolean {
  const v = process.env.JIRA_CLI_COMPACT?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return agent
}

export function truncateText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** エージェント向け: id/self を落とし、空フィールド省略、説明は切り詰め */
export function slimIssue(i: IssueSummary): Record<string, unknown> {
  const o: Record<string, unknown> = {
    key: i.key,
    summary: i.summary,
    status: i.status,
    issuetype: i.issuetype,
  }
  if (i.assignee) o.assignee = i.assignee
  if (i.reporter) o.reporter = i.reporter
  if (i.priority) o.priority = i.priority
  if (i.created) o.created = i.created
  if (i.updated) o.updated = i.updated
  if (i.labels?.length) o.labels = i.labels
  if (i.components?.length) o.components = i.components
  if (i.duedate) o.duedate = i.duedate
  if (i.parent) o.parent = i.parent
  const d = i.description?.trim()
  if (d) o.description = truncateText(d, DESC_MAX)
  return o
}

export function slimIssueEnvelope(issue: IssueSummary, compact: boolean) {
  if (!compact) return { issue }
  return { issue: slimIssue(issue) }
}

export function slimSearch(
  data: {
    count: number
    isLast?: boolean
    nextPageToken: string | null | undefined
    issues: IssueSummary[]
    jql: string
  },
  compact: boolean,
) {
  if (!compact) return data
  return {
    n: data.count,
    ...(data.isLast !== undefined ? { last: data.isLast } : {}),
    ...(data.nextPageToken ? { next: data.nextPageToken } : {}),
    /** issues（短縮キー i） */
    i: data.issues.map(slimIssue),
  }
}

export function slimMyself(
  data: {
    accountId: string
    displayName: string
    emailAddress?: string
    active?: boolean
  },
  compact: boolean,
) {
  if (!compact) return data
  const o: Record<string, unknown> = {
    id: data.accountId,
    n: data.displayName,
  }
  if (data.emailAddress) o.m = data.emailAddress
  return o
}

export function slimComments(
  data: {
    key: string
    total: number
    comments: Array<{ id: string; author: string; created: string; body: string }>
  },
  compact: boolean,
) {
  if (!compact) return data
  return {
    k: data.key,
    n: data.total,
    c: data.comments.map((x) => ({
      id: x.id,
      a: x.author || undefined,
      t: x.created,
      b: x.body ? truncateText(x.body, COMMENT_BODY_MAX) : undefined,
    })),
  }
}

export function slimProjects(
  data: {
    count: number
    projects: Array<{ key: string; id: string; name: string; projectTypeKey: string }>
  },
  compact: boolean,
) {
  if (!compact) return data
  return {
    n: data.count,
    p: data.projects.map((x) => ({
      k: x.key,
      name: x.name,
      type: x.projectTypeKey,
    })),
  }
}

export function slimUsers(
  data: {
    count: number
    users: Array<{
      accountId: string
      displayName: string
      emailAddress: string
      mention: string
    }>
    hint: string
  },
  compact: boolean,
) {
  if (!compact) return data
  return {
    n: data.count,
    u: data.users.map((x) => ({
      id: x.accountId,
      n: x.displayName,
      m: x.emailAddress || undefined,
      ph: x.mention,
    })),
  }
}

export function slimCreate(
  data: { key: string; id: string; self: string },
  compact: boolean,
) {
  if (!compact) return data
  return { k: data.key, id: data.id }
}

export function slimUpdate(data: { ok: boolean; key: string }, compact: boolean) {
  if (!compact) return data
  return { ok: data.ok, k: data.key }
}

export function slimTransitions(
  data: {
    key: string
    transitions: Array<{ id: string; name: string; toStatus: string }>
  },
  compact: boolean,
) {
  if (!compact) return data
  return {
    k: data.key,
    t: data.transitions.map((x) => ({ id: x.id, n: x.name, s: x.toStatus })),
  }
}
