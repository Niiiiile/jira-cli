import { Buffer } from 'node:buffer'
import { adfToMarkdown } from './adf.js'
import type { JiraCredentials } from './config.js'
import { normalizeJiraBaseUrl } from './jira-env.js'

function formatJiraError(status: number, data: unknown): string {
  if (data && typeof data === 'object' && 'errorMessages' in data) {
    const msgs = (data as { errorMessages?: string[] }).errorMessages
    if (Array.isArray(msgs) && msgs.length) return msgs.join('; ')
  }
  if (data && typeof data === 'object' && 'errors' in data) {
    const err = (data as { errors?: Record<string, string> }).errors
    if (err && typeof err === 'object') {
      return Object.entries(err)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')
    }
  }
  return `HTTP ${status}`
}

export async function jiraRequest<T = unknown>(
  env: JiraCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = normalizeJiraBaseUrl(env.host)
  const url = `${base}/rest/api/3${path.startsWith('/') ? path : `/${path}`}`
  const token = Buffer.from(`${env.email}:${env.apiToken}`).toString('base64')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Basic ${token}`)
  headers.set('Accept', 'application/json')
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    throw new Error(`Jira API ${res.status}: ${formatJiraError(res.status, data)}`)
  }

  return data as T
}

type IssueFields = {
  summary?: string
  status?: { name?: string }
  assignee?: { displayName?: string } | null
  reporter?: { displayName?: string } | null
  issuetype?: { name?: string }
  priority?: { name?: string }
  description?: unknown
  created?: string
  updated?: string
  labels?: string[]
  components?: Array<{ name?: string }>
  duedate?: string | null
  parent?: { key?: string; fields?: { summary?: string; status?: { name?: string } } } | null
}

export type IssueSummary = {
  key: string
  id: string
  self: string
  summary: string
  status: string
  assignee: string | null
  reporter: string | null
  issuetype: string
  priority: string | null
  /** description を ADF から Markdown に変換した文字列（無ければ null） */
  description: string | null
  created: string | null
  updated: string | null
  labels: string[]
  components: string[]
  duedate: string | null
  parent: { key: string; summary: string; status: string } | null
}

export function toIssueSummary(raw: {
  key: string
  id: string
  self: string
  fields?: IssueFields
}): IssueSummary {
  const f = raw.fields ?? {}
  const descRaw = f.description
  const description =
    descRaw != null && typeof descRaw === 'object'
      ? adfToMarkdown(descRaw).trim() || null
      : null
  const parent =
    f.parent?.key != null
      ? {
          key: f.parent.key,
          summary: f.parent.fields?.summary ?? '',
          status: f.parent.fields?.status?.name ?? '',
        }
      : null
  return {
    key: raw.key,
    id: raw.id,
    self: raw.self,
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    issuetype: f.issuetype?.name ?? '',
    priority: f.priority?.name ?? null,
    description,
    created: f.created ?? null,
    updated: f.updated ?? null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name ?? '').filter(Boolean),
    duedate: f.duedate ?? null,
    parent,
  }
}
