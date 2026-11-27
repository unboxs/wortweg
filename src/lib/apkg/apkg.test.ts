import { zstdCompressSync } from 'node:zlib'
import { BlobReader, Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { exportAppBackup, exportDeckArchive, exportImportedText, restoreImportedText } from './backup'
import { mapNote } from './map'
import type { RawNote } from './types'
import { QUOTA_MESSAGE } from './messages'
import { importApkgFile } from './import-run'
import { openApkg } from './parse'
import { isQuotaError } from './quota'
import { clearAllImported, getMediaBlob, listDecks, listNotes } from './storage'

const require = createRequire(import.meta.url)

const RICH_FIELDS = [
  'Lemma',
  'Display',
  'Article',
  'Gender',
  'POS',
  'POSLabel',
  'Level',
  'IPA',
  'Plural',
  'PluralOnly',
  'NoPlural',
  'Genitive',
  'NDekl',
  'Feminine',
  'VerbClass',
  'Pres3',
  'Praet',
  'PerfAux',
  'Partizip',
  'Aux',
  'Separable',
  'Reflexive',
  'Government',
  'Comparative',
  'Superlative',
  'Meaning',
  'English',
  'Note',
  'Sentence',
  'SentenceMeaning',
  'SentenceAudio',
  'Sentence2',
  'SentenceMeaning2',
  'SentenceAudio2',
  'WordAudio',
]

let SQL: SqlJsStatic

beforeAll(async () => {
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  const wasm = readFileSync(wasmPath)
  SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) })
})

beforeEach(async () => {
  await clearAllImported()
})

describe('mapNote', () => {
  it('maps a notes-style record and does not invent missing IPA or audio', () => {
    const noun = mapNote(rich('haus', nounFields()))
    expect(noun?.german).toBe('das Haus')
    expect(noun?.zh).toBe('房子')
    expect(noun?.en).toBe('house')
    expect(noun?.ipa).toBe('haʊs')
    expect(noun?.level).toBe('A1')
    expect(noun?.example).toBe('Das Haus ist groß.')
    expect(noun?.examples).toEqual([
      { de: 'Das Haus ist groß.', zh: '房子很大。', audioName: 'haus-s1.mp3' },
      { de: 'Wir kaufen ein Haus.', zh: '我们买一栋房子。', audioName: 'haus-s2.mp3' },
    ])
    expect(noun?.audioName).toBe('haus.mp3')
    expect(noun?.imageName).toBe('haus.jpg')
    expect(noun?.grammar).toMatchObject({
      article: 'das',
      gender: 'n',
      plural: 'Häuser',
      genitive: 'Hauses',
      pos: '名词',
    })

    const verb = mapNote(
      rich('gehen', {
        Lemma: 'gehen',
        POS: 'verb',
        POSLabel: '动词',
        Level: 'A1',
        Pres3: 'geht',
        Praet: 'ging',
        Partizip: 'gegangen',
        Aux: 'ist',
        Separable: 'no',
        Meaning: '走',
        English: 'to go',
      }),
    )
    expect(verb?.german).toBe('gehen')
    expect(verb?.ipa).toBeUndefined()
    expect(verb?.example).toBeUndefined()
    expect(verb?.audioName).toBeUndefined()
    expect(verb?.imageName).toBeUndefined()
    expect(verb?.grammar).toMatchObject({ pres3: 'geht', praet: 'ging', partizip: 'gegangen', aux: 'ist' })
    expect(verb?.grammar?.separable).toBeUndefined()

    const bare = mapNote({
      guid: 'bare',
      modelName: 'Basic',
      deckName: 'Deck',
      tags: [],
      fields: [
        { name: 'Front', value: 'Apfel' },
        { name: 'Back', value: '苹果' },
      ],
    })
    expect(bare).toMatchObject({ german: 'Apfel', zh: '苹果' })
    expect(bare?.ipa).toBeUndefined()
    expect(bare?.example).toBeUndefined()
    expect(bare?.audioName).toBeUndefined()
    expect(bare?.grammar?.article).toBeUndefined()
  })

  it('best-effort maps a two-field note and skips an empty one', () => {
    const swapped = mapNote({
      guid: 'swap',
      modelName: 'Basic',
      deckName: 'Deck',
      tags: [],
      fields: [
        { name: 'Front', value: '房子' },
        { name: 'Back', value: 'das Haus' },
      ],
    })
    expect(swapped?.german).toBe('das Haus')
    expect(swapped?.zh).toBe('房子')

    const unknown = mapNote({
      guid: 'unk',
      modelName: 'Custom',
      deckName: 'Deck',
      tags: ['tag'],
      fields: [
        { name: 'Word', value: 'die Schule' },
        { name: 'Gloss', value: '学校' },
      ],
    })
    expect(unknown?.german).toBe('die Schule')
    expect(unknown?.zh).toBe('学校')

    expect(
      mapNote({
        guid: 'empty',
        modelName: 'Basic',
        deckName: 'Deck',
        tags: [],
        fields: [
          { name: 'Front', value: '   ' },
          { name: 'Back', value: '' },
        ],
      }),
    ).toBeNull()
  })

  it('ignores remote images instead of fetching them', () => {
    const note = mapNote({
      guid: 'remote',
      modelName: 'Basic',
      deckName: 'Deck',
      tags: [],
      fields: [
        { name: 'Front', value: 'Haus <img src="https://example.com/haus.jpg">' },
        { name: 'Back', value: '房子' },
      ],
    })
    expect(note?.imageName).toBeUndefined()
    expect(note?.german).toBe('Haus')
  })
})

describe('parse and import', () => {
  it('reads a legacy collection and a simpler two-field note from one .apkg', async () => {
    const file = await legacyApkg()
    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = ((url: string) => {
      calls.push(String(url))
      throw new Error('network')
    }) as typeof fetch
    try {
      const opened = await openApkg(file, { sql: SQL, fileName: '合成.apkg' })
      expect(opened.notes.map((note) => note.modelName).sort()).toEqual(['Basic', 'Basic', 'DeutschNotes', 'DeutschNotes'])
      const mapped = opened.notes.map((note) => mapNote(note))
      const haus = mapped.find((note) => note?.german === 'das Haus')
      expect(haus?.zh).toBe('房子')
      expect(haus?.audioName).toBe('haus.mp3')
      expect(opened.mediaByName.has('haus.mp3')).toBe(true)
      await opened.close()
    } finally {
      globalThis.fetch = original
    }
    expect(calls).toEqual([])
  })

  it('reads the new notetypes schema and a zstd collection.anki21b', async () => {
    const modern = await openApkg(await modernApkg(), { sql: SQL })
    expect(mapNote(modern.notes[0]!)?.german).toBe('die Schule')
    expect(mapNote(modern.notes[0]!)?.zh).toBe('学校')
    await modern.close()

    const compressed = await openApkg(await zstdApkg(), { sql: SQL })
    expect(
      compressed.notes
        .map((note) => mapNote(note)?.german)
        .filter((german): german is string => !!german)
        .sort(),
    ).toEqual(['Apfel', 'das Haus', 'gehen'])
    await compressed.close()
  })

  it('does not duplicate notes when the same pack is imported again', async () => {
    const file = await legacyApkg()
    const first = await importApkgFile(file, { sql: SQL })
    const second = await importApkgFile(file, { sql: SQL })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.replaced).toBe(true)
    expect(second.message).toContain('没有另建一套重复词条')
    const decks = await listDecks()
    expect(decks).toHaveLength(1)
    const notes = await listNotes(decks[0]!.id)
    expect(notes).toHaveLength(first.imported)
    expect(notes.map((note) => note.german).sort()).toEqual(['Apfel', 'das Haus', 'gehen'])
    const audio = await getMediaBlob(decks[0]!.id, 'haus.mp3')
    expect(audio).toBeTruthy()
    expect(new Uint8Array(await audio!.arrayBuffer())).toEqual(MP3)
  })

  it('stops saving media when storage quota is refused and says so in Chinese', async () => {
    let puts = 0
    const result = await importApkgFile(await legacyApkg(), {
      sql: SQL,
      putMediaFile: async () => {
        puts++
        if (puts >= 2) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    })
    expect(isQuotaError(new DOMException('quota', 'QuotaExceededError'))).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.mediaIncomplete).toBe(true)
    expect(result.mediaStored).toBe(1)
    expect(result.message).toContain('存储空间')
    expect(result.message).toBeTruthy()
    expect(QUOTA_MESSAGE).toContain('没有静默失败')
    const decks = await listDecks()
    expect(decks).toHaveLength(1)
    expect(decks[0]!.mediaIncomplete).toBe(true)
    const notes = await listNotes(decks[0]!.id)
    expect(notes.some((note) => note.german === 'das Haus')).toBe(true)
    expect(await getMediaBlob(decks[0]!.id, 'haus.mp3')).toBeNull()
  })
})

describe('backup', () => {
  it('exports text notes and does not pretend the media went with them', async () => {
    await importApkgFile(await legacyApkg(), { sql: SQL })
    const text = await exportImportedText()
    expect(text).toHaveLength(1)
    expect(text[0]!.mediaIncluded).toBe(false)
    expect(text[0]!.notes.some((note) => note.german === 'das Haus' && note.ipa === 'haʊs')).toBe(true)
    const json = await exportAppBackup()
    const parsed = JSON.parse(json) as { importedMedia: boolean; mediaNote: string; importedDecks: { mediaIncluded: boolean }[] }
    expect(parsed.importedMedia).toBe(false)
    expect(parsed.mediaNote).toContain('音频和图片不在这份备份里')
    expect(parsed.importedDecks[0]!.mediaIncluded).toBe(false)
    expect(json.includes(String.fromCharCode(...MP3))).toBe(false)

    await clearAllImported()
    const restored = await restoreImportedText(text)
    expect(restored.notes).toBe(text[0]!.notes.length)
    const decks = await listDecks()
    expect(decks[0]!.mediaFromBackupOnly).toBe(true)
    expect(await getMediaBlob(decks[0]!.id, 'haus.mp3')).toBeNull()
    const again = await restoreImportedText(text)
    expect(again.decks).toBe(1)
    expect(await listDecks()).toHaveLength(1)
  })

  it('round-trips a small media archive without duplicating notes', async () => {
    const imported = await importApkgFile(await legacyApkg(), { sql: SQL })
    const archive = await exportDeckArchive(imported.deckId!)
    expect(archive.mediaIncluded).toBe(true)
    expect(archive.mediaNote).toContain('音频和图片')
    await clearAllImported()
    const restored = await importApkgFile(new File([archive.blob], 'wortweg-deck.zip', { type: 'application/zip' }))
    expect(restored.ok).toBe(true)
    expect(restored.mediaStored).toBeGreaterThan(0)
    const decks = await listDecks()
    expect(decks).toHaveLength(1)
    const blob = await getMediaBlob(decks[0]!.id, 'haus.mp3')
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(MP3)
    const second = await importApkgFile(new File([archive.blob], 'wortweg-deck.zip', { type: 'application/zip' }))
    expect(second.replaced).toBe(true)
    expect(await listDecks()).toHaveLength(1)
    expect(await listNotes(decks[0]!.id)).toHaveLength(restored.imported)
  })
})

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x68, 0x61, 0x75, 0x73])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const SENT = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x73, 0x31])

function nounFields(): Record<string, string> {
  return {
    Lemma: 'Haus',
    Display: '<b>das Haus</b> [sound:haus.mp3] <img src="haus.jpg">',
    Article: 'das',
    Gender: 'n',
    POS: 'noun',
    POSLabel: '名词',
    Level: 'A1',
    IPA: 'haʊs',
    Plural: 'Häuser',
    Genitive: 'Hauses',
    Meaning: '房子',
    English: 'house',
    Note: '中性',
    Sentence: 'Das Haus ist groß.',
    SentenceMeaning: '房子很大。',
    SentenceAudio: '[sound:haus-s1.mp3]',
    Sentence2: 'Wir kaufen ein Haus.',
    SentenceMeaning2: '我们买一栋房子。',
    SentenceAudio2: '[sound:haus-s2.mp3]',
    WordAudio: '[sound:haus.mp3]',
  }
}

function rich(guid: string, values: Record<string, string>): RawNote {
  return {
    guid,
    modelName: 'DeutschNotes',
    deckName: '合成德语 A1',
    tags: [],
    fields: RICH_FIELDS.map((name) => ({ name, value: values[name] ?? '' })),
  }
}

async function legacyApkg(): Promise<File> {
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE col (
      id integer primary key, crt integer, mod integer, scm integer, ver integer,
      dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text
    );
    CREATE TABLE notes (
      id integer primary key, guid text, mid integer, mod integer, usn integer,
      tags text, flds text, sfld text, csum integer, flags integer, data text
    );
    CREATE TABLE cards (
      id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer,
      type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
      lapses integer, left integer, odue integer, odid integer, flags integer, data text
    );
  `)
  const nounId = 1600000000000
  const basicId = nounId + 1
  const deckId = 1700000000000
  const models = {
    [nounId]: { id: nounId, name: 'DeutschNotes', flds: RICH_FIELDS.map((name, ord) => ({ name, ord })) },
    [basicId]: {
      id: basicId,
      name: 'Basic',
      flds: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
    },
  }
  const decks = {
    '1': { id: 1, name: 'Default' },
    [deckId]: { id: deckId, name: '合成德语 A1' },
  }
  const col = db.prepare(
    `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')`,
  )
  col.run([JSON.stringify(models), JSON.stringify(decks)])
  col.free()
  insertNote(db, 1, 'haus', nounId, RICH_FIELDS.map((name) => nounFields()[name] ?? '').join('\x1f'))
  insertNote(db, 2, 'gehen', nounId, RICH_FIELDS.map((name) => (name === 'Lemma' ? 'gehen' : name === 'POS' ? 'verb' : name === 'POSLabel' ? '动词' : name === 'Level' ? 'A1' : name === 'Pres3' ? 'geht' : name === 'Praet' ? 'ging' : name === 'Partizip' ? 'gegangen' : name === 'Aux' ? 'ist' : name === 'Meaning' ? '走' : name === 'English' ? 'to go' : '')).join('\x1f'))
  insertNote(db, 3, 'apfel', basicId, ['Apfel', '苹果'].join('\x1f'))
  insertNote(db, 4, 'empty', basicId, ['   ', ''].join('\x1f'))
  insertCard(db, 11, 1, deckId)
  insertCard(db, 12, 2, deckId)
  insertCard(db, 13, 3, deckId)
  insertCard(db, 14, 4, deckId)
  const sqlite = db.export()
  db.close()
  const bytes = await zipBytes({
    'collection.anki2': sqlite,
    media: new TextEncoder().encode(JSON.stringify({ '0': 'haus.mp3', '1': 'haus.jpg', '2': 'haus-s1.mp3', '3': 'haus-s2.mp3' })),
    '0': MP3,
    '1': JPG,
    '2': SENT,
    '3': new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x73, 0x32]),
  })
  return new File([copyBytes(bytes)], '合成.apkg', { type: 'application/octet-stream' })
}

async function modernApkg(): Promise<Blob> {
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE notetypes (id integer primary key, name text);
    CREATE TABLE fields (ntid integer, ord integer, name text);
    CREATE TABLE decks (id integer primary key, name text);
    CREATE TABLE notes (
      id integer primary key, guid text, mid integer, mod integer, usn integer,
      tags text, flds text, sfld text, csum integer, flags integer, data text
    );
    CREATE TABLE cards (
      id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer,
      type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
      lapses integer, left integer, odue integer, odid integer, flags integer, data text
    );
  `)
  db.run(`INSERT INTO notetypes (id, name) VALUES (9, 'Basic')`)
  db.run(`INSERT INTO fields (ntid, ord, name) VALUES (9, 0, 'Front'), (9, 1, 'Back')`)
  db.run(`INSERT INTO decks (id, name) VALUES (3, '现代牌组')`)
  insertNote(db, 1, 'schule', 9, ['die Schule', '学校'].join('\x1f'))
  insertCard(db, 1, 1, 3)
  const sqlite = db.export()
  db.close()
  const bytes = await zipBytes({
    'collection.anki21': sqlite,
    media: new TextEncoder().encode('{}'),
  })
  return new Blob([copyBytes(bytes)])
}

async function zstdApkg(): Promise<Blob> {
  const legacy = await legacyApkg()
  const readerBytes = new Uint8Array(await legacy.arrayBuffer())
  const reader = new ZipReader(new BlobReader(new Blob([readerBytes])))
  const entries = await reader.getEntries()
  const collection = entries.find((entry) => !entry.directory && entry.filename === 'collection.anki2')
  if (!collection || collection.directory) throw new Error('fixture missing collection')
  const sqlite = await collection.getData(new Uint8ArrayWriter())
  await reader.close()
  const compressed = zstdCompressSync(sqlite)
  const bytes = await zipBytes({
    'collection.anki21b': compressed,
    media: new TextEncoder().encode(JSON.stringify({ '0': 'haus.mp3' })),
    '0': MP3,
  })
  return new Blob([copyBytes(bytes)])
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function insertNote(db: Database, id: number, guid: string, mid: number, flds: string) {
  const stmt = db.prepare(
    `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, 0, 0, '', ?, ?, 0, 0, '')`,
  )
  stmt.run([id, guid, mid, flds, flds.split('\x1f')[0] ?? ''])
  stmt.free()
}

function insertCard(db: Database, id: number, nid: number, did: number) {
  const stmt = db.prepare(
    `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
     VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
  )
  stmt.run([id, nid, did])
  stmt.free()
}

async function zipBytes(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, data] of Object.entries(files)) {
    await writer.add(name, new Uint8ArrayReader(data))
  }
  return writer.close()
}
