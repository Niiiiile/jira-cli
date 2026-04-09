import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface Profile {
  host: string
  email: string
  apiToken: string
}

export interface Config {
  default?: string
  profiles: Record<string, Profile>
}

export interface JiraCredentials {
  host: string
  email: string
  apiToken: string
}

export interface ResolveOptions {
  profile?: string
  host?: string
  email?: string
  apiToken?: string
}

export const DEFAULT_PROFILE_NAME = 'default'

const CONFIG_PATH = join(homedir(), '.config', 'jira-cli', 'config.json')

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return { profiles: {} }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config
  } catch {
    return { profiles: {} }
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

/**
 * 認証情報を以下の優先順位で解決する:
 * 1. コマンドフラグ (--host / --email / --api-token)
 * 2. 設定ファイルのプロファイル (--profile または default)
 * 3. 環境変数 / .env (JIRA_HOST / JIRA_EMAIL / JIRA_API_TOKEN)
 */
export function resolveCredentials(opts: ResolveOptions): JiraCredentials {
  const config = readConfig()
  const profileName = opts.profile ?? config.default
  const profileData = profileName ? config.profiles[profileName] : undefined

  const host = opts.host ?? profileData?.host ?? process.env.JIRA_HOST
  const email = opts.email ?? profileData?.email ?? process.env.JIRA_EMAIL
  const apiToken = opts.apiToken ?? profileData?.apiToken ?? process.env.JIRA_API_TOKEN

  if (!host) {
    throw new Error(
      'Jira host が未設定です。--host フラグ、プロファイル、または JIRA_HOST 環境変数を設定してください。',
    )
  }
  if (!email) {
    throw new Error(
      'Jira email が未設定です。--email フラグ、プロファイル、または JIRA_EMAIL 環境変数を設定してください。',
    )
  }
  if (!apiToken) {
    throw new Error(
      'Jira API token が未設定です。--api-token フラグ、プロファイル、または JIRA_API_TOKEN 環境変数を設定してください。',
    )
  }

  return {
    host: host.trim(),
    email: email.trim(),
    apiToken: apiToken.trim(),
  }
}
