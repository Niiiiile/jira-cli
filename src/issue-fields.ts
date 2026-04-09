/** issue search でよく使う fields（一覧取得時） */
export const ISSUE_LIST_FIELDS = [
  'summary',
  'status',
  'assignee',
  'reporter',
  'issuetype',
  'priority',
  'created',
  'updated',
  'labels',
  'parent',
] as const

/** issue get で取得する fields（ISSUE_LIST_FIELDS + 詳細） */
export const ISSUE_DETAIL_FIELDS = [
  ...ISSUE_LIST_FIELDS,
  'description',
  'components',
  'duedate',
] as const
