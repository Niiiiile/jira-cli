import { markdownToAdfSync } from '../src/md-to-adf.js'
import { adfToMarkdown } from '../src/adf-to-md.js'

const samples: Array<{ name: string; md: string }> = [
  {
    name: 'heading + paragraph',
    md: `# タイトル

これは **太字** と *斜体* と ~~取消~~ と \`code\` を含む段落です。`,
  },
  {
    name: 'bullet / ordered / task',
    md: `- 項目 A
- 項目 **B**
- 項目 C

1. 最初
2. 次
3. 最後

- [ ] 未完了
- [x] 完了`,
  },
  {
    name: 'code block',
    md: '```ts\nconst x: number = 42\nconsole.log(x)\n```',
  },
  {
    name: 'blockquote',
    md: `> 重要な引用
> もう一行`,
  },
  {
    name: 'link + mention',
    md: `詳細は [公式](https://example.com) を参照。担当は @[email:user@example.com] にメンション。`,
  },
  {
    name: 'horizontal rule',
    md: `前半

---

後半`,
  },
]

let fail = 0
for (const s of samples) {
  const adf = markdownToAdfSync(s.md)
  const md = adfToMarkdown(adf)
  console.log(`\n=== ${s.name} ===`)
  console.log('--- input md ---')
  console.log(s.md)
  console.log('--- adf ---')
  console.log(JSON.stringify(adf, null, 2))
  console.log('--- rendered md ---')
  console.log(md)
  if (md.length === 0) fail++
}

if (fail > 0) {
  console.error(`\n${fail} sample(s) produced empty output`)
  process.exit(1)
}
console.log('\nAll samples rendered.')
