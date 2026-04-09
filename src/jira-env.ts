import { z } from 'incur'

/** 環境変数スキーマ（各コマンドで共有） */
export const jiraEnvSchema = z.object({
  JIRA_HOST: z
    .string()
    .min(1)
    .describe('Jira サイトホスト（例: your-company.atlassian.net、https は不要）'),
  JIRA_EMAIL: z.string().email().describe('Atlassian アカウントのメール'),
  JIRA_API_TOKEN: z.string().min(1).describe('API トークン（Atlassian アカウント設定から発行）'),
  JIRA_CLI_COMPACT: z
    .string()
    .optional()
    .describe(
      '1/true=常に圧縮出力、0/false=常にフル、未設定=パイプ/非TTY のときだけ圧縮（エージェント向けトークン削減）',
    ),
})

export type JiraEnv = z.infer<typeof jiraEnvSchema>

export function normalizeJiraBaseUrl(host: string): string {
  let h = host.trim()
  if (h.startsWith('https://')) h = h.slice('https://'.length)
  else if (h.startsWith('http://')) h = h.slice('http://'.length)
  h = h.replace(/\/$/, '')
  return `https://${h}`
}
