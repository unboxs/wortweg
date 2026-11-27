// 第一周体验：冷却锁、题型、答错说明、音标缺口、主题名。
// 用 Vite 加载源码，这样不用改现有的无扩展名 import。
import assert from 'node:assert/strict'
import { createServer, type ViteDevServer } from 'vite'

const mem = new Map<string, string>()
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

const server: ViteDevServer = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const gold = await server.ssrLoadModule('/src/lib/goldlist.ts')
const exercises = await server.ssrLoadModule('/src/lib/exercises.ts')
const ipa = await server.ssrLoadModule('/src/lib/ipa.ts')
const labels = await server.ssrLoadModule('/src/lib/labels.ts')
const shadow = await server.ssrLoadModule('/src/lib/shadow.ts')
const storeMod = await server.ssrLoadModule('/src/store.ts')

const DAY = gold.DAY as number
let failed = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok  ${name}`)
  } catch (err) {
    failed++
    console.error(`FAIL  ${name}`)
    console.error(err)
  }
}

const entry = (german: string, id = 'e1') => ({
  id,
  german,
  zh: '释义',
  tags: ['jcpruefung'],
  mastered: false,
  createdAt: 0,
})

const list = (over: Record<string, unknown> = {}) => ({
  id: 'list-1',
  name: 'Headlist · 教材·考试用语',
  round: 0,
  createdAt: 0,
  lastActivityAt: 0,
  entries: [entry('der Test')],
  ...over,
})

const now = Date.UTC(2026, 10, 27)

check('冷却中不能蒸馏，满 14 天可以', () => {
  const cooling = list({ lastActivityAt: now - 10 * DAY })
  assert.equal(gold.stageOf(cooling, 14, now), 'cooling')
  assert.equal(gold.canDistill(cooling, 14, now), false)
  const ready = list({ lastActivityAt: now - 14 * DAY })
  assert.equal(gold.canDistill(ready, 14, now), true)
})

check('未抄写的新列表不能蒸馏，旧列表不带 writePending 时时钟不变', () => {
  const writing = list({ writePending: true, lastActivityAt: now - 30 * DAY })
  assert.equal(gold.stageOf(writing, 14, now), 'writing')
  assert.equal(gold.canDistill(writing, 14, now), false)
  const legacy = list({ lastActivityAt: now - 10 * DAY })
  assert.equal(gold.stageOf(legacy, 14, now), 'cooling')
  assert.equal(legacy.lastActivityAt, now - 10 * DAY)
})

check('冷却天数夹在 5–30', () => {
  assert.equal(gold.clampCooldown(0), 5)
  assert.equal(gold.clampCooldown(14), 14)
  assert.equal(gold.clampCooldown(100), 30)
  assert.equal(gold.clampCooldown(Number.NaN), 14)
  const recent = list({ lastActivityAt: now - 3 * DAY })
  assert.equal(gold.canDistill(recent, 0, now), false)
  const twenty = list({ lastActivityAt: now - 20 * DAY })
  assert.equal(gold.canDistill(twenty, 100, now), false)
  const thirtyOne = list({ lastActivityAt: now - 31 * DAY })
  assert.equal(gold.canDistill(thirtyOne, 100, now), true)
})

check('没有可蒸馏列表时，学习模式计入今日目标', () => {
  const cooling = [list({ lastActivityAt: now - 1 * DAY })]
  const daily = { day: gold.dayKey(new Date(now)), count: 0, practice: 6 }
  const waiting = gold.goalProgress(cooling, 14, daily, now)
  assert.equal(waiting.mode, 'practice')
  assert.equal(waiting.shown, 6)
  const ready = [list({ lastActivityAt: now - 20 * DAY })]
  const distilling = gold.goalProgress(ready, 14, { ...daily, count: 2, practice: 6 }, now)
  assert.equal(distilling.mode, 'distill')
  assert.equal(distilling.shown, 2)
})

check('惯用语不出冠词题，名词会出', () => {
  const idiom = { german: 'das Wort ergreifen', zh: '起立发言' }
  const nerves = { german: 'die Nerven verlieren', zh: '失去冷静' }
  const noun = { german: 'der Test', zh: '测试' }
  assert.equal(exercises.eligibleKinds(idiom).includes('article'), false)
  assert.equal(exercises.eligibleKinds(nerves).includes('article'), false)
  assert.equal(exercises.nounPhrase('das Wort ergreifen'), null)
  assert.equal(exercises.nounPhrase('die Nerven verlieren'), null)
  assert.equal(exercises.eligibleKinds(noun).includes('article'), true)
  assert.equal(exercises.nounPhrase('der Test')?.gender, 'm')
})

check('答错会说明性别', () => {
  const entry = { german: 'der Test', zh: '测试' }
  const article = { kind: 'article' as const, family: '定冠词', answer: 'der', speakOnEnter: false }
  const articleMsg = exercises.explainWrong(entry, article, 'die')
  assert.match(articleMsg, /^不对/)
  assert.match(articleMsg, /阳性/)
  assert.match(articleMsg, /不是「die」/)
  const recall = { kind: 'recall' as const, answer: 'der Test', speakOnEnter: false }
  const recallMsg = exercises.explainWrong(entry, recall, 'die Test')
  assert.match(recallMsg, /^不对/)
  assert.match(recallMsg, /阳性/)
  assert.match(recallMsg, /der/)
  const letters = { kind: 'letters' as const, answer: 'ort', speakOnEnter: false }
  assert.match(exercises.explainWrong({ german: 'der Antwortbogen', zh: '答题纸' }, letters, 'xxx'), /^不对/)
})

check('音标：有出处的补上，没有出处的留空', () => {
  assert.equal(ipa.ipaFor('der Antwortbogen'), undefined)
  const toilette = ipa.ipaFor('die Toilette') as string
  assert.match(toilette, /toˈlɛtə/)
  assert.ok(toilette.replace(/[/\s]/g, '').length > 0)
  const pair = ipa.ipaFor('Arbeitstag/Werktag') as string
  assert.match(pair, /aʁbaɪ̯t͡s/)
  assert.match(pair, /vɛʁk/)
})

check('主题 id 显示中文名', () => {
  assert.equal(labels.tagLabel('jcpruefung'), '教材·考试用语')
  assert.equal(labels.tagLabel('自定义'), '自定义')
})

check('跟读宽松比对', () => {
  assert.equal(shadow.shadowMatch('der Punkt', 'Punkt'), true)
  assert.equal(shadow.shadowMatch('der Punkt', 'Banane'), false)
})

check('直接蒸馏冷却中的列表不会记成长期记忆', () => {
  const { useStore } = storeMod
  const id = useStore.getState().createList('考试', [{ german: 'der Test', zh: '测试', tags: ['jcpruefung'] }])
  const created = useStore.getState().lists.find((l: { id: string }) => l.id === id)
  assert.equal(created.writePending, true)
  assert.equal(useStore.getState().distillList(id, [created.entries[0].id]), null)
  assert.equal(useStore.getState().lists.find((l: { id: string }) => l.id === id).entries[0].mastered, false)
  assert.equal(useStore.getState().finishWriting(id), false)

  useStore.getState().markCopied(id, created.entries[0].id)
  assert.equal(useStore.getState().finishWriting(id), true)
  const cooling = useStore.getState().lists.find((l: { id: string }) => l.id === id)
  assert.equal(cooling.writePending, false)
  assert.equal(gold.canDistill(cooling, 14), false)
  assert.equal(useStore.getState().distillList(id, [cooling.entries[0].id]), null)
  assert.equal(useStore.getState().lists.find((l: { id: string }) => l.id === id).entries[0].mastered, false)

  useStore.setState({
    lists: useStore.getState().lists.map((l: { id: string; lastActivityAt: number }) =>
      l.id === id ? { ...l, lastActivityAt: Date.now() - 20 * DAY } : l,
    ),
  })
  const opened = useStore.getState().lists.find((l: { id: string }) => l.id === id)
  assert.equal(gold.canDistill(opened, 14), true)
  const result = useStore.getState().distillList(id, [])
  assert.ok(result)
  assert.equal(result.mastered, 0)
  assert.equal(useStore.getState().lists.find((l: { id: string }) => l.id === id).entries[0].mastered, false)
})

await server.close()
if (failed) {
  console.error(`${failed} 项失败`)
  process.exit(1)
}
console.log('phase1 检查通过')
