# 框架说明（Architecture）

《公关洗地模拟器》是一个纯静态的 HTML/JS 游戏：没有构建步骤、没有 npm 依赖，双击 `Start.html` 就能玩，也可以用 `python tools/serve.py` 起本地服务。整体遵循三条原则：

1. **关卡与引擎分离**：关卡是纯 JSON 数据，引擎只认 schema；新增关卡不需要改任何代码。
2. **数值由引擎算，AI 只写内容和有界打分**：AI 输出一律是 JSON，经结构校验和数值钳制后才交给引擎换算；任何 AI 失败都自动回退离线规则。
3. **引擎不碰 DOM**：同一套引擎既跑在浏览器里，也能在 Node 里做单元测试和自动平衡模拟；游戏界面可以挂载到任意容器，编辑器的“试玩”直接复用它。

---

## 1. 分层架构

```mermaid
flowchart TB
  subgraph Pages["入口页面"]
    Start["Start.html<br/>标题 / 选单 / 作战室"]
    Editor["LevelEditor.html<br/>关卡编辑器"]
  end

  subgraph UI["界面层 js/ui · js/editor"]
    App["app.js 选关与导入"]
    GameUI["game.js 简报→作战室→结案"]
    Panels["statement.js 公文编辑器<br/>items.js 道具对话框<br/>charts.js 图表 · settings.js 设置"]
    Forms["fields.js 字段元数据<br/>forms.js 表单/条件/效果构建器<br/>ai-assist.js AI 生成关卡"]
  end

  subgraph Engine["引擎层 js/engine（无 DOM）"]
    Game["engine.js Game 编排"]
    Mods["feed · actions · sim · truth<br/>objectives · opponents · events · scoring"]
    DSL["schema.js 默认值与校验<br/>cond.js 条件 DSL · effects.js 效果 DSL"]
  end

  subgraph AI["AI 层 js/llm"]
    Prompts["prompts.js 任务目录 + WW.AI.run"]
    Client["client.js 设置 · 适配器 · JSON 提取"]
    Shape["shape.js 输出结构 / JSON Schema"]
    Offline["offline.js 离线规则"]
  end

  subgraph Data["数据层"]
    Lib["js/data 默认道具库 · 技能库 · 难度 · 阵营 · 文本池"]
    Levels["levels/*.js 内置关卡（纯 JSON）"]
    Store["localStorage 设置 · 存档 · 成绩 · 自定义关卡"]
  end

  Start --> App --> GameUI
  Editor --> Forms
  Forms -->|试玩| GameUI
  GameUI --> Panels
  GameUI --> Game
  Game --> Mods --> DSL
  Game -->|runAI| Prompts
  Prompts --> Client --> Shape
  Prompts -->|失败/未启用| Offline
  Client -->|Anthropic SDK / fetch| LLM[("LLM 服务<br/>Claude / OpenAI 兼容")]
  Client -.->|可选| Proxy["tools/serve.py<br/>本地跨域转发"] -.-> LLM
  Game --> Lib
  App --> Levels
  GameUI --> Store
  Forms --> Store
```

所有脚本都是经典 `<script>`（不是 ES module），挂在全局命名空间 `window.WW` 上——因为浏览器在 `file://` 下会拦截本地 module 的加载。加载顺序见 `Start.html`：core → data → engine → llm → ui → `levels/manifest.js`。

---

## 2. 目录与模块职责

| 路径 | 职责 |
|---|---|
| `Start.html` | 游戏入口，加载全部脚本 |
| `LevelEditor.html` | 关卡编辑器入口 |
| `js/core/` | `ns.js` 命名空间 · `log.js` 异常日志 · `util.js` 种子随机数/格式化/深合并 · `bus.js` 事件总线 · `storage.js` 带兜底的本地存储 |
| `js/data/` | 默认数据：`platforms` 平台与作者层级 · `factions` 阵营与“作用渠道” · `personas` 网民画像 · `pools` 离线文本池 · `statements` 公文类型 · `items` 道具库 · `abilities` 对手技能库 · `difficulty` 难度表 |
| `js/engine/schema.js` | 关卡默认值、`normalize()` 补全、`validate()` 校验（编辑器与引擎共用） |
| `js/engine/cond.js` · `effects.js` | 条件 DSL 与效果 DSL：求值、中文描述、校验 |
| `js/engine/feed.js` | 帖子模型、作者生成、舆论压力 Π |
| `js/engine/items.js` · `actions.js` | 道具解析与可用性；18 种道具的效果实现 |
| `js/engine/truth.js` | 否认/承认、证据曝光、打脸、辟谣、承诺跳票、监管“铁拳” |
| `js/engine/sim.js` | 回合演化：阵营漂移、热度衰减、扒水军、旧账爆雷、客户满意度；生成“发帖位” |
| `js/engine/objectives.js` | 主任务阶段 / 子任务 / 支线 |
| `js/engine/guide.js` | 教程引导：按条件推进步骤、当前步骤、帖子选择器（UI 的教程卡片与测试共用） |
| `js/engine/opponents.js` | 对手盘：选招、意图、技能效果、专属事件 |
| `js/engine/events.js` | 回合开局：证据、承诺、脚本事件、随机事件 |
| `js/engine/scoring.js` | 结案评分与评级 |
| `js/engine/engine.js` | `Game` 类：状态、帮助函数、`act()` / `endTurn()` / 存档 |
| `js/engine/levels.js` | 关卡注册表、动态加载内置关卡、导入解析、导出脚本 |
| `js/engine/bots.js` | 离线机器人：固定打法（平衡表用）、照教程卡片操作、参数化打法 `policy(genome)`（编辑器通关测试和 Node 测试共用） |
| `js/llm/` | AI 设置与适配器（`client.js`）、任务提示词与运行器（`prompts.js`）、输出结构（`shape.js`）、离线规则（`offline.js`） |
| `js/ui/` | 界面：`app.js` 选关 · `game.js` 作战室 · `runs.js` 存档（档案馆、对局记录、写成爽文） · `statement.js` 公文编辑器 · `items.js` 道具对话框 · `charts.js` 图表 · `settings.js` 设置 · `dom.js` 安全的 DOM 工具 |
| `js/editor/` | 编辑器：`fields.js` 字段元数据 · `forms.js` 表单渲染 · `editor.js` 主程序 · `levelgen.js` 分段生成关卡（无 DOM，评测也用）· `ai-assist.js` AI 生成弹窗与分区补全 · `levelcheck.js` 通关测试的扫描与体检分析（无 DOM，`--check` 也用）· `levelcheck-ui.js` 通关测试弹窗 |
| `levels/` | `manifest.js` 内置关卡清单 + 每关一个文件 |
| `tools/serve.py` | 可选的本地静态服务 + LLM 跨域转发 + API Key 托管（`/api/key`） |
| `tools/keystore.py` | Key 托管的存储：环境变量 / Windows DPAPI / Linux `secret-tool` / 0600 文件 |
| `tests/run.js` | Node 测试：单元测试 + 自动平衡模拟 + `--check` 通关测试 |

---

## 3. 关卡加载与开局

```mermaid
sequenceDiagram
  participant P as 玩家
  participant App as app.js
  participant Lv as WW.Levels
  participant UI as GameUI
  participant S as WW.Schema
  participant G as Game

  App->>Lv: loadBuiltins()（按 manifest 注入 <script>）
  Lv-->>App: register(level) × N
  App->>Lv: list()（内置 + 浏览器里的自定义关卡）
  P->>App: 点选订单
  App->>S: validate(level)
  S-->>App: errors / warnings
  App->>UI: mount(container, level)
  UI-->>P: 委托书（客户口径、红线、对手、难度）
  P->>UI: 选难度并签约
  UI->>G: new Game(level, {difficulty, aiRunner: WW.AI.run})
  G->>S: normalize(level)（补齐默认值）
  G->>G: 初始化阵营/事实/对手/任务/初始帖子/对手意图
  G-->>UI: change 事件
  UI-->>P: 作战室 + 开局简报
```

内置关卡文件内容只有一行 `WW.Levels.register({ ...纯 JSON... })`，这样 `file://` 下也能加载；自定义关卡只以 JSON 形式导入或存进浏览器，**从不执行关卡里的代码**。

---

## 4. 回合引擎主循环

`game.endTurn()` 是整个模拟的心脏。顺序很重要：对手先出招，再做数值演化，然后进入下一回合的“晨报”，最后才让 AI 按**已经算好的数值**写内容。

```mermaid
flowchart TD
  A([玩家点击 结束回合]) --> B["对手回合<br/>反应型技能（截图存档）→ 执行上回合公布的意图"]
  B --> C{"触发失败条件？<br/>解约/翻车/社死"}
  C -- 是 --> Z([结案：失败])
  C -- 否 --> D["数值演化 sim.step<br/>持续效果 → 舆论压力Π → 阵营漂移 → 热度衰减/扩散<br/>暴露度冷却 → 扒水军检定 → 旧账爆雷 → 客户满意度"]
  D --> E{"已是最后一回合？"}
  E -- 是 --> V{"主任务完成<br/>或满足到期胜利条件？"}
  V -- 是 --> W([结案：成功])
  V -- 否 --> Z
  E -- 否 --> F["回合+1，恢复行动点"]
  F --> G["晨报 events.turnStart<br/>证据曝光 → 承诺跳票 → 脚本事件<br/>对手入场/专属事件 → 随机事件"]
  G --> H["生成发帖位 sim.feedPlan<br/>按阵营好感抽立场 + 事件/对手请求的帖子"]
  H --> I["AI 写内容 feed.generate<br/>（失败则离线模板）"]
  I --> J["检查主任务/子任务 → 发放奖励"]
  J --> K["对手规划下回合意图"]
  K --> L([晨报弹窗，进入行动阶段])
```

玩家的每一次行动走 `game.act(itemId, params)`：

```mermaid
flowchart LR
  A["选择道具与参数"] --> B{"Items.status<br/>解锁?冷却?次数?AP?预算?"}
  B -- 不可用 --> X["提示原因"]
  B -- 可用 --> C["handler.validate"]
  C --> D["handler.run<br/>（可调用 AI：评审/筛帖/生成内容）"]
  D --> E["扣预算/行动点，记冷却与次数"]
  E --> F["记录日志与数值变化"]
  F --> G["检查子任务与失败条件"]
  G --> H["change 事件 → 界面刷新 → 自动存档"]
```

---

## 5. AI 调用管线

所有 AI 调用都经过 `WW.AI.run(game, task, args)`，它**永远会返回结果**：

```mermaid
sequenceDiagram
  participant E as 引擎/界面
  participant R as WW.AI.run
  participant P as 任务定义 TASKS[task]
  participant C as WW.LLM.chat
  participant M as 模型服务
  participant O as 离线规则

  E->>R: run(task, args)
  alt AI 未配置 / 强度不包含该任务
    R->>O: Offline.run(task, args)
    O-->>E: {data, source:"offline"}
  else 调用 AI
    R->>P: system（关卡上下文，整关不变，可缓存）+ user（本回合局势）
    R->>C: chat({system, user, shape, effort, stream})
    C->>M: Anthropic SDK messages.create/stream<br/>或 fetch /chat/completions
    M-->>C: 文本（可流式）
    C-->>R: text
    R->>R: extractJSON（去代码块、括号匹配、去尾逗号）
    opt 解析失败
      R->>C: 修复请求（让模型只输出合法 JSON）
      C-->>R: text
    end
    R->>R: Shape.coerce 补默认值并钳制数值范围<br/>post() 过滤不存在的 id
    R-->>E: {data, source:"ai"}
  end
  Note over R,O: 网络错误/超时/拒答/截断/解析失败 → 回退离线规则，并带上 error 供界面提示
```

两种适配器：

| 适配器 | 用于 | 要点 |
|---|---|---|
| Anthropic | Claude 官方 / Anthropic 格式中转 | 官方 `@anthropic-ai/sdk`（CDN 按需 `import()`，钉死 0.131.0，`dangerouslyAllowBrowser`）；`output_config.effort` 按任务设定；JSON 任务用 `output_config.format`（严格 JSON Schema）；system 块开启 prompt caching；官方地址默认开启服务端拒答回退；中转不认这些参数时自动降级重试 |
| OpenAI 兼容 | DeepSeek、通义、Kimi、智谱、豆包、硅基流动、OpenRouter、Ollama…… | `POST {base}/chat/completions`；JSON 任务带 `response_format`（LM Studio 等支持 schema 的先用 `json_schema`，其余先用 `json_object` 再试 `json_schema`；400 时换下一种，最后不带，并按接口地址 + 模型记住可用的那一种）；SSE 流式解析 |

详细的任务清单与 JSON 协议见 [AI.md](AI.md)。

---

## 6. 数据模型

```mermaid
classDiagram
  class Level {
    id
    meta
    client: name, contact, demands[], expectations[]
    incident: summary, keywords[], severity
    facts[]: Fact
    contract: turns, actionPoints, budget
    initialStats
    factions[]
    personas[]
    seedPosts[]
    items: enabled[], unlocks, overrides, custom[]
    objectives: stages[], side[]
    opponents[]
    abilities[]
    events[]
    randomEvents[]
    victory, defeat[], grading
    guide[], ai, offline
  }
  class GameState {
    turn, difficulty, seed, rngState
    stats: sentiment, heat, credibility, exposure, satisfaction
    budget, ap, apMax
    factions: id→Faction
    facts: id→FactState
    lieDebt, promises[]
    posts[]: Post
    opponents: id→OpponentState
    objectives: stageIndex, progress, tasks
    trend, modifiers[], shillBatches[], risks[]
    log[], messages[], history[]
    finished, result, final
  }
  class Post {
    id, turn, platform
    author: name, tier, faction, persona, opp
    content, stance(-2..2), fact
    likes, reposts, comments[]
    status, throttled, controlled
    isShill, isClient, isScreenshot, immune
  }
  class FactState {
    text, clientClaim
    isTrue, regulatory, weight
    public, revealed, refuted, known, fixed
    admitted, denied, debt
    evidence: turn, chance, source, suppressBy[]
  }
  class OpponentState {
    strength, morale, resources
    active, retired, coopted
    cooldowns, intent, lastMove
    flags: spreadRumor, usedShill
  }
  Level "1" --> "1" GameState : normalize + init
  GameState "1" --> "*" Post
  GameState "1" --> "*" FactState
  GameState "1" --> "*" OpponentState
  Post --> FactState : fact
  Post --> OpponentState : opp
```

`GameState` 是可序列化的纯数据（随机数状态也在里面），存档就是 `JSON.stringify(state)`；同一个种子 + 同样的操作必然得到同样的结果（离线模式下）。

---

## 7. 关卡编辑器如何复用引擎

```mermaid
flowchart LR
  F["fields.js<br/>13 个分区的字段元数据"] --> R["forms.js<br/>通用表单渲染<br/>条件构建器 / 效果构建器"]
  R -->|读写| L[("原始关卡 JSON")]
  L --> V["WW.Schema.validate<br/>与引擎同一份校验"]
  V --> Side["右栏：错误/提醒，点击跳到对应分区"]
  L --> T["▶ 试玩：全屏浮层里 mount GameUI<br/>（testMode：不写存档和成绩）"]
  L --> X["导出 JSON / 导出 levels/*.js"]
  L --> B["保存到浏览器 → 游戏选关界面可见"]
  AI["ai-assist.js<br/>一句话生成 / 分区补全"] -->|校验并列出问题后载入| L
```

---

## 8. 存储、存档与安全

| 键（localStorage，前缀 `ww.`） | 内容 |
|---|---|
| `settings` | AI 设置（不含 Key；托管模式下只有 `serverKeyOrigin` 和掩码 `serverKeyHint`） |
| `apikey` / sessionStorage `apikey` | API Key（仅“保存在本浏览器”/“仅本次会话”模式；切到托管模式时删除） |
| `runs` | 存档索引：每局一条（关卡、难度、回合、是否结案、评级、⭐、是否已成文、时间） |
| `run.<存档id>` | 一局的完整存档（`Game.serialize()`）+ `ending`（结案报告）+ `story`（爽文）。每次签约开局新建一份；结案后保留为战绩，帖子只留最热 30 条。已结案的局最多 30 份，超出或写入时空间不足，自动删最旧的未加星战绩（进行中的局从不自动删）。旧版的 `save.<关卡id>` 首次读取时迁移过来 |
| `records` | 每关 × 每难度的最佳成绩 |
| `customLevels` | 编辑器保存或导入的关卡 |
| `editorDraft` | 编辑器草稿 |
| `theme` | 界面主题 |
| `errorLog` | 异常日志：最近 100 条错误和警告（`js/core/log.js`，写入前脱敏，不含 Key） |

- 异常日志：`js/core/log.js` 紧跟 `ns.js` 加载，不依赖 DOM。它负责三件事：
  - 监听 `error`（含资源加载失败）和 `unhandledrejection`，并镜像 `console.error/warn`；
  - 引擎、事件总线、AI 调用、关卡生成、红色 toast 都通过 `WW.Log.error/warn/info(source, msg, detail)` 写入；
  - 连续相同的记录合并计数，内存最多保留 300 条；warn/error 持久化到 `errorLog`。

  `js/ui/logview.js` 是查看面板，入口是 🐞 按钮和 `Ctrl+Shift+L`。
- 帖子、关卡文本、AI 输出全部以 `textContent` / 文本节点渲染，没有 `innerHTML`，防止 XSS。
- 自定义关卡只解析 JSON，不执行代码。
- API Key 默认由 `tools/serve.py` 托管（`tools/keystore.py`：环境变量 / Windows DPAPI / Linux `secret-tool` / 0600 文件），浏览器只留掩码；Key 绑定接口地址的源，代理只把它注入发往该源的请求，且不跟随重定向。选择浏览器保存时存在 localStorage / sessionStorage。无论哪种方式，Key 都只发给你填写的接口地址；AI 调用日志不记录 Key。
- `tools/serve.py` 只监听 `127.0.0.1`，校验 Host 头（只认 `127.0.0.1:<端口>` / `localhost:<端口>`）；转发和 `/api/key` 只接受 POST，且 Origin 必须是本服务页面（`/api/key` 还要求 `Content-Type: application/json`），`file://` 页面和沙箱 iframe（`Origin: null`）及其他网站一律 403；以 `.` 开头的路径不对外提供；上游只允许 http/https。

---

## 9. 测试与平衡

```bash
node tests/run.js
```

- 单元测试：随机数确定性、模板、深合并、条件 DSL、schema 补全与校验、离线评审、离线分词、存档恢复、输出结构转 JSON Schema、JSON 提取容错，以及**所有内置关卡零校验错误**。
- 平衡模拟：用 6 种机器人策略（摆烂 / 全水军 / 真诚 / 平衡 / 高手 / 随机）在每关每档难度各跑若干局，统计胜率、平均分、评级分布和失败原因。`--balance 50 --diffs all` 跑完整报告，`--trace smart --level milktea` 打印单局逐回合数值。
- 通关测试：`node tests/run.js --check <关卡 id 或 .json 文件> [--depth quick|standard|deep] [--intent any|admit|cover]`，和编辑器里的「🧪 通关测试」是同一套扫描与判定（见 [Gameplay.md](Gameplay.md#14-通关测试关卡合理性体检)），有红色结论时退出码为 2。结果见 [Gameplay.md](Gameplay.md#13-难度曲线与平衡数据)。
