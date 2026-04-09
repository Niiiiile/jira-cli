import { z } from 'incur'

/** 全コマンド共通の認証オプション */
export const authOptions = z.object({
  profile: z.string().optional().describe('使用するプロファイル名'),
  host: z.string().optional().describe('Jira サイトホストまたは URL（上書き）'),
  email: z.string().optional().describe('Atlassian アカウントのメール（上書き）'),
  apiToken: z.string().optional().describe('Jira API トークン（上書き）'),
})
