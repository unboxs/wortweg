# Wortweg · 德语词汇蒸馏

**Wortweg**（"词语之路"）是一个纯前端的德语学习工具，以 **Goldlist Method（金列表法）** 为唯一核心逻辑，面向想要从 B1 迈向 B2 的学习者。

> 不闪卡、不逼回忆、不搞"每日复习轰炸"。写下 → 冷却两周 → 蒸馏，让自然遗忘曲线替你筛选出真正学会的词。

![Stack](https://img.shields.io/badge/React%2019-TS-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind%20CSS%204-38bdf8) ![Vite](https://img.shields.io/badge/Vite%206-646cff)

## 快速开始

```bash
npm install
npm run dev        # 开发模式 http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览生产构建
```

学习记录存在浏览器 localStorage，可随时导出/导入 JSON 备份。在线发音（VoiceRSS、ElevenLabs）由同一次 Cloudflare Pages 部署里的 Function 代理：浏览器只请求本站 `/api/tts`，API Key 只放在 Cloudflare 的环境变量里。

## Goldlist 在这里如何实现

### 数据模型（`src/types.ts` + `src/lib/goldlist.ts`）

```
GList ──┬─ round: 0            → Headlist（初表）
        ├─ round: n            → D(n)，已完成 n 次蒸馏
        ├─ lastActivityAt      → 冷却时钟起点（创建时间或上次蒸馏时间）
        └─ entries: Entry[]
                ├─ mastered: false → 仍在蒸馏循环中
                └─ mastered: true  → 已送入长期记忆
```

关键设计决策：

1. **蒸馏不产生新列表**。传统做法是 Headlist → 复制出 D1 → 复制出 D2……本项目用**一个列表 + round 计数 + 词条 mastered 标记**表达同样的结构，避免数据重复和同步错误。"D2" 就是"这个列表的 round=2 状态"。
2. **列表状态（冷却中/可蒸馏/已完成）从不持久化**，它是 `列表数据 + 当前时间 + 冷却天数` 的纯函数（`stageOf()`）。改冷却天数，全部列表状态即时重算，永远不会出现脏状态。
3. **蒸馏动作（`distillList`）**是唯一写入口之一：传入本轮判为"已记住"的词条 id，引擎原子地完成——标记 mastered → round+1 → 重置冷却时钟 → 记录蒸馏历史 → 结算 XP/streak/成就/每日目标。中途退出不落库，无半途状态。
4. **绝无强制回忆**。蒸馏界面先出现德语词（自动朗读），释义延迟半秒淡入——这是"被动吸收"的节奏设计，不是抢答测验。抄写模式是可选项且永不拦截判定。
5. **学习区刻意排除冷却中的列表**。`/study` 只提供三种方法论安全的内容：温习已掌握的词（巩固长期记忆）、探索词库中未学过的词（读完可一键建为下一份 Headlist）、数字训练。冷却列表若可随时翻看，就破坏了 Goldlist 赖以工作的自然遗忘。
6. **抄写门槛升级为七题型练习流**。练习由 `lib/exercises` 从词条自动派生（不泄题的题型才自动朗读）：冠词题按名词性别出定/不定/否定/物主四家族；例句题仅对带例句的词条出现（惯用语主题全部带例句）；连线上义配对独立成模式。蒸馏页的抄写模式仍是可选项。

### 保留率与"自然遗忘"

每轮蒸馏后展示保留率（带入下一轮的比例）。Goldlist 的经验值是 60–70%：落在区间内会得到"你的大脑正按遗忘曲线工作"的反馈。保留率异常也不批评——偏小说明吸收极好，偏大只说明这批词偏难。

### 意义感

- **已掌握** = 至少经受住一轮蒸馏仍被你判为"记住了"的词（`mastered: true`）。
- 仪表盘主打数字永远是"你已经把 X 个词送入了长期记忆"。
- 蒸馏成功率（历史上被判记住的比例）、按主题掌握进度、可导出的已掌握 CSV。

### 游戏化（全部来自真实学习行为）

| 事件 | XP |
|---|---|
| 创建 Headlist | +15 |
| 蒸馏检视一个词 | +1 |
| 送一个词入长期记忆 | +3 |
| 一份列表完全蒸馏完毕 | +25 |
| 新的一天有学习活动 | +5 |

等级曲线 `50·n·(n+1)`（前期快后期慢），等级称号均为德语：Neuling → Sammler → … → Goldmeister → Legende。另有 15 个成就、连续学习 streak、每日目标金环、**词汇森林**（每份列表一棵树，蒸馏一轮长高一分，完成即满树金黄）。

## 功能地图

| 页面 | 内容 |
|---|---|
| 仪表盘 `/` | 长期记忆主数字、每日目标环、可蒸馏/冷却中列表、专注计时（25min 自愿）、Goldlist 原则卡 |
| 我的列表 `/lists` | 状态筛选（可蒸馏/冷却中/已完成）、冷却进度条与剩余天数 |
| 列表详情 `/lists/:id` | 词条表（发音、例句、笔记、难度、主题标签）、快速添加、整表连读、内联编辑 |
| 新建 `/new` | ① 内置词库挑选（13 主题、搜索、随机选 25、已在学自动去重）② 手动/粘贴导入（`德语 \| 释义` 一行一条） |
| 学习模式 `/study` | **默认教学模式**：看词 · 听音 · 释义延迟浮现，看完自由翻页（新手零门槛进入）；顶部可切**练习模式**（选择会被记住）：抄写 · 冠词（定/不定/否定/物主）· 补全字母 · 听写 · 例句填空 · 释义→德语 · 句子重组，全部从词条数据自动出题、解出自动翻页，读完可一键把探索批次建成 Headlist；**连线练习**（词义配对）、**字母听写**与数字训练为独立模式 |
| 字母听写（学习区内） | 播放单词的逐字母拼写——每个字母读德语字母名（be, ce, eff, jot, ku, vau, ypsilon, zet, eszett…），字母槽高亮当前朗读位，用户写下听到的词（宽松比对，可看首字母提示）。词源优先用已掌握的词（拼自己的词汇最有意义），名词取裸词根，不足回退词库 |
| 数字训练（学习区内） | 整合自 GermanLearn 项目：听音辨数、看数写词、数字串听力（电话号码式）、数字表（0–20+整十锚点含 IPA）。`numberToGerman()` 合成引擎让 TTS 可读 **0–9999 任意数字**——补上原项目仅覆盖 29 个录音锚点、无法训练合成数的缺口。范围阶梯：基础 0–20 / 进阶 0–100 / 实战 0–9999 |
| 蒸馏 `/distill/:id` | 全屏沉浸、自动朗读、可选抄写模式、键盘流（空格=记住 / N=还没 / S=朗读 / D=慢速）、蒸馏总结 |
| 成长 `/progress` | 等级、统计、词汇森林、主题掌握、成就墙 |
| 设置 `/settings` | 冷却天数、每日目标、释义语言、发音源（系统 / VoiceRSS / ElevenLabs / Polly / Google）与语速、主题、备份导入导出、清空数据 |

## 内置词库

`src/data/bank/` —— **24 个主题、3496 个手工整理的词条**，按学习阶梯排序：

**A1 入门（212）** · **A2 基础（103）** —— 零基础起点：问候、人称、疑问词、sein/haben 等核心动词、家庭、颜色、星期、购物方位与叙述连接词。

**B1–B2（2387）**：日常生活 · 工作与职场 · 旅行与交通 · 情感与性格 · 观点与讨论 · 抽象概念 · 教育与科学 · 健康与身体 · 经济社会与媒体 · 环境与自然 · 时间与变化 · 高频动词与形容词 · 惯用语与客套（139 条全部带例句）

**教材词汇表（795，dychb.pdf 导入）**：缩写 · 家庭与婚姻 · 考试用语 · 颜色与方位 · 职业（含阴性形式）· 国家与民族 · 学校科目 · 时间与计量 · 数字与序数 · 核心词汇 A–Z。已与现有词库去重、拆分阴阳性词条、修正 PDF 个别错印（如 Polizist 释义、提取截断释义）。重导入：把 `dychb.pdf` 放到项目根目录，跑 `npm run pdf:import`（原始 PDF 因版权不入库）。

紧凑格式一行一条（`德语 | 释义 | 例句`），由 `parse.ts` 解析。想扩充词库：在任何主题文件里照格式加行即可，无需改动代码。`npm run bank:check` 可随时校验词库完整性（空释义、格式异常都会被报出）。

## TTS

设置页可以选择发音源，点「试听」会读 `Guten Tag! Ich lerne gern Deutsch.`。学习页和蒸馏页的朗读走同一条路径。

| 源 | 音色 | 说明 |
|---|---|---|
| 系统语音（默认） | 系统/浏览器已装的德语语音包 | 离线可用；音质取决于语音包 |
| 在线 · VoiceRSS | Hanna / Lina / Jonas | 本站 `/api/tts` 代理，德语 `de-de`，MP3 |
| 在线 · ElevenLabs | Lily / Charlotte / Daniel | 同一个代理。默认模型 `eleven_flash_v2_5`，`language_code=de` |
| 在线 · Amazon Polly | Vicki / Marlene / Hans | 旧的 StreamElements 接口，经常 401 |
| 在线 · Google 翻译 | 单一音色 | 旧接口，国内经常失败。桌面播放不带 Referer |

VoiceRSS 和 ElevenLabs 的音频在点击处理函数里用共享的 `<audio playsinline>` 开始播放（手机），慢速只改 `playbackRate`，不重复扣合成额度。代理失败时回落系统德语语音，并提示一次。整表连读、字母拼写、数字串跟随当前发音源。

**没有德语语音时**：桌面浏览器拒绝用系统默认嗓音（往往是中文）硬读德语，并提示安装德语语音包或改用在线发音源。手机（iOS Safari、Android Chrome）在系统源下若没有德语语音，仍会改播在线音频。选了 VoiceRSS 或 ElevenLabs 时，手机和桌面都只请求本站代理。手机上的系统语音也不会在 `cancel()` 之后立刻 `speak()`——Safari 会丢掉那一条，点了没声音。

### Cloudflare 密钥

Pages 会在构建时带上仓库根目录的 `functions/`。`functions/api/tts.ts` 对应 `GET /api/tts`。这次推送的预览地址形如：

`https://cursor-reliable-online-tts-9bae.wortweg.pages.dev`

分支名里的 `/` 会变成 `-`。生产环境仍是现有的 Pages 项目（`wortweg.pages.dev`，或你已经绑的自定义域名）。

在 Cloudflare 控制台为**生产**和**预览**都添加加密变量（Settings → Variables and Secrets → Secret）：

| 名称 | 作用 |
|---|---|
| `VOICERSS_API_KEY` | VoiceRSS 密钥 |
| `ELEVENLABS_API_KEY` | ElevenLabs 密钥（`xi-api-key`） |

可选。只有当账号用不了下面的预置音色时才需要，值是音色 id，不是 API Key：

| 名称 | 对应设置里的音色 | 未设置时使用的预置 id |
|---|---|---|
| `ELEVENLABS_VOICE_LILY` | Lily | `pFZP5JQG7iQjIQuC4Bku` |
| `ELEVENLABS_VOICE_CHARLOTTE` | Charlotte | `XB0fDUnXU5powFXDhCwa` |
| `ELEVENLABS_VOICE_DANIEL` | Daniel | `onwK4e9ZLuTAKqWW03F9` |

2026 年 3 月之后注册的 ElevenLabs 账号可能没有这些 Default 音色，免费套餐也不能通过 API 使用 Voice Library。代理在预置 id 返回 404 时会改用 `GET /v1/voices` 里该密钥实际能用的第一只音色。若列表也是空的，请在 ElevenLabs 里准备一只可用音色，并把 id 填进上面的可选变量。保存密钥后重新部署一次预览和生产，Function 才会读到新值。

密钥不会写进前端包，也不会出现在 git 里。不要把真实 key 放进 `.env`、`.dev.vars` 或任何会提交的文件。本地调试把 `.dev.vars.example` 复制为 `.dev.vars`（已在 `.gitignore`）再运行 `npm run dev`，Vite 会在本机提供同一个 `/api/tts`。没有密钥时接口返回 503，朗读回落系统语音。

VoiceRSS 免费档大约每天 350 次请求，ElevenLabs 免费档每月约 10,000 credits；flash 模型按半个 credit 计，同样的字数能读得更久。代理把单次文本限制在 300 字以内，并缓存成功的音频。

仓库里故意没有带 `pages_build_output_dir` 的 Wrangler 配置，避免一次推送把现有 Pages 项目的控制台设置覆盖掉。Function 由 Pages 的 git 集成按 `functions/` 目录自动挂上。

## 项目结构

```
src/
├── types.ts              # 领域模型（Entry / GList / Settings…）
├── lib/
│   ├── goldlist.ts       # Goldlist 引擎：状态推导、统计、日期
│   ├── xp.ts             # 等级曲线、成就定义与判定
│   └── tts.ts            # 系统语音 + 本站代理播放（德语优选、慢速、连读）
├── store.ts               # Zustand + localStorage 持久化 + 全部业务动作
├── data/bank/            # 内置词库（13 主题 2387 词条）
├── components/           # Layout / Toasts / FocusTimer / ui 杂件
├── hooks/useSpeech.ts
└── pages/                # Dashboard / Lists / ListDetail / NewHeadlist / Distill / Progress / Settings
functions/
├── api/tts.ts            # Pages Function：GET /api/tts
├── tts-handler.ts        # 只从环境变量读取 VoiceRSS / ElevenLabs 密钥
└── tts-contract.ts       # 音色与 /api/tts 地址，前后端共用，不含密钥
```

## 已知边界

- 释义语言切换（中/英）：内置词库以中文释义为主，英文优先显示只对带有英文释义的词条生效（手动创建的词条可两者都填）。
- 词龄按列表级计算：蒸馏作用于整份列表；若蒸馏中途往列表里加词，新词会跟着整表时钟走。严格派可在冷却结束后另开 Headlist。
- Chrome 长文本 TTS 有限制，本应用只朗读单词/短句，不受影响；无语音环境自动降级（按钮保留但不发声）。
