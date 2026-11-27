/**
 * 词库里查不到、但能在公开词典核对到的读音。
 * 只收录下面注释里的第一种读音，不编造、不把两个词拼成复合词音标。
 * 机器生成、未经词典编辑核对的转写（例如 DWDS API status=auto）不收。
 *
 * 仍然没有可靠来源、因此继续留空的例子：Antwortbogen
 * （de.wiktionary 无词条，duden.de 无此词条，DWDS 只有自动转写）。
 */
export const IPA_EXTRA: Record<string, string> = {
  // https://de.wiktionary.org/wiki/Arbeitstag — [ˈaʁbaɪ̯t͡sˌtaːk]
  Arbeitstag: '/ˈaʁbaɪ̯t͡sˌtaːk/',
  // https://de.wiktionary.org/wiki/Werktag — [ˈvɛʁkˌtaːk]
  Werktag: '/ˈvɛʁkˌtaːk/',
  // https://de.wiktionary.org/wiki/Toilette — 第一条 [toˈlɛtə]
  Toilette: '/toˈlɛtə/',
  // https://de.wiktionary.org/wiki/ausziehen — [ˈaʊ̯sˌt͡siːən]
  ausziehen: '/ˈaʊ̯sˌt͡siːən/',
  // https://de.wiktionary.org/wiki/daf%C3%BCr — [daˈfyːɐ̯]
  dafür: '/daˈfyːɐ̯/',
  // https://de.wiktionary.org/wiki/heraus — [hɛˈʁaʊ̯s]
  heraus: '/hɛˈʁaʊ̯s/',
  // https://de.wiktionary.org/wiki/herein — [hɛˈʁaɪ̯n]
  herein: '/hɛˈʁaɪ̯n/',
  // https://de.wiktionary.org/wiki/raus — 德语副词 [ʁaʊ̯s]
  raus: '/ʁaʊ̯s/',
  // https://de.wiktionary.org/wiki/rein — 德语副词/形容词 [ʁaɪ̯n]
  rein: '/ʁaɪ̯n/',
}
