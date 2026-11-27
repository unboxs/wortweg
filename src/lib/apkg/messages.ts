/** 用户能看见的说明。测试会锁住这几句，避免界面把失败说成成功。 */

export const QUOTA_MESSAGE =
  '浏览器存储空间不足，无法继续保存这套牌组的音频或图片。文字词条已经留下，没有静默失败。请在系统或浏览器里给本站更多空间（或清掉不用的站点数据）后，重新导入同一个 .apkg。'

export const FILE_TOO_BIG_MESSAGE =
  '这个文件超过 1.5 GB，当前页面没法安全地在内存里打开它。请换用小一些的牌组，或只导出需要的子牌组。'

export const NOT_AN_APKG_MESSAGE = '无法打开这个文件。请选择 Anki 导出的 .apkg（或本站导出的牌组包）。'

export const NO_COLLECTION_MESSAGE =
  '这个压缩包里没有 collection.anki2 / collection.anki21。它可能不是 Anki 牌组。'

export const BAD_COLLECTION_MESSAGE = '牌组数据库无法读取。请确认这是 Anki 导出的 .apkg，而不是改过后缀的其他文件。'

export const CANCELLED_MESSAGE = '导入已取消。'

export const CANCELLED_PARTIAL_MESSAGE =
  '导入已取消。已经写入的文字词条会留下，还没保存的音频和图片不在本机。'

export const BACKUP_MEDIA_NOTE =
  'JSON 备份包含学习记录，以及已导入牌组的文字（德语、释义、例句、语法、等级）。音频和图片不在这份备份里。换一台浏览器后，请重新导入原来的 .apkg，才能恢复发音和图片。'

export const FULL_EXPORT_WARN =
  '含音频和图片的完整备份可能非常大，浏览器有可能因为内存不足而失败。失败时不会把它算作已导出。平时请留着原来的 .apkg。'

export const FULL_EXPORT_FAILED =
  '完整包导出失败，音频和图片没有导出。文字备份仍然可用，原来的 .apkg 也还在你的电脑上。'

export const ARCHIVE_INCOMPLETE_NOTE = '这个包只包含当时已经保存在本机的媒体。缺的音频和图片不会被说成已经导出。'
