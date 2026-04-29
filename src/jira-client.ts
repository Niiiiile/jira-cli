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
  return jiraRequestApi<T>(env, 3, path, init)
}

export async function jiraRequestV2<T = unknown>(
  env: JiraCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return jiraRequestApi<T>(env, 2, path, init)
}

async function jiraRequestApi<T = unknown>(
  env: JiraCredentials,
  apiVersion: 2 | 3,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = normalizeJiraBaseUrl(env.host)
  const url = `${base}/rest/api/${apiVersion}${path.startsWith('/') ? path : `/${path}`}`
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

/**
 * 任意の Jira URL からバイナリ/テキストを取得する（Basic 認証付き）。
 * Jira REST v3 の attachment/content/{id} などリダイレクトを伴う URL にも対応。
 */
export async function jiraFetchBinary(
  env: JiraCredentials,
  urlOrPath: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string | null }> {
  const base = normalizeJiraBaseUrl(env.host)
  const url = /^https?:\/\//i.test(urlOrPath)
    ? urlOrPath
    : `${base}/rest/api/3${urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`}`
  const token = Buffer.from(`${env.email}:${env.apiToken}`).toString('base64')
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${token}`,
      Accept: '*/*',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let data: unknown = null
    if (body) {
      try {
        data = JSON.parse(body)
      } catch {
        data = { raw: body }
      }
    }
    throw new Error(`Jira API ${res.status}: ${formatJiraError(res.status, data)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream'
  const cd = res.headers.get('content-disposition') ?? ''
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
  const filenameRaw = m?.[1] ?? m?.[2] ?? null
  const filename = filenameRaw ? decodeURIComponent(filenameRaw.trim()) : null
  return { bytes: buf, mimeType, filename }
}

type RawAttachment = {
  id?: string
  filename?: string
  mimeType?: string
  size?: number
  created?: string
  content?: string
  thumbnail?: string
  author?: { displayName?: string; accountId?: string } | null
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
  attachment?: RawAttachment[]
}

export type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
  created: string | null
  author: string | null
  /** 認証付きダウンロード URL（Basic 認証の API クライアントが必要） */
  content: string
  thumbnail: string | null
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
  /** renderedFields.description の HTML（expand=renderedFields 指定時のみ） */
  renderedDescription: string | null
  created: string | null
  updated: string | null
  labels: string[]
  components: string[]
  duedate: string | null
  parent: { key: string; summary: string; status: string } | null
  attachments: Attachment[]
}

export function toIssueSummary(raw: {
  key: string
  id: string
  self: string
  fields?: IssueFields
  renderedFields?: { description?: string | null }
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
  const attachments: Attachment[] = (f.attachment ?? []).map((a) => ({
    id: a.id ?? '',
    filename: a.filename ?? '',
    mimeType: a.mimeType ?? '',
    size: typeof a.size === 'number' ? a.size : 0,
    created: a.created ?? null,
    author: a.author?.displayName ?? null,
    content: a.content ?? '',
    thumbnail: a.thumbnail ?? null,
  }))
  const rendered = raw.renderedFields?.description
  const renderedDescription =
    typeof rendered === 'string' && rendered.length > 0 ? rendered : null
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
    renderedDescription,
    created: f.created ?? null,
    updated: f.updated ?? null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name ?? '').filter(Boolean),
    duedate: f.duedate ?? null,
    parent,
    attachments,
  }
}
