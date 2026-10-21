# Whitewash Simulator (公关洗地模拟器)

[简体中文](README.md) | **English**

> Every contract is a war for public opinion. Delete posts, steer the comments, hire a troll army, call in the regulators… and, once in a while, tell the truth.

A satirical crisis-PR simulation game set on the Chinese internet, with optional LLM integration. It is plain HTML/JS with no build step. You run a PR agency, and each level is a contract: a client is in trouble and hands you a budget and a fixed number of turns to "whitewash" public opinion before the deadline. Meanwhile, the client may be lying to you, hidden evidence may surface and contradict you, your paid commenters may get exposed, and rivals may report you to the authorities.

> **Note:** The game's interface, levels and in-depth docs are currently **Chinese only**. This page is an English overview.

This is a work of fiction and satire: all characters, brands, organizations and events are fictional, and any real events or institutions that appear are only used as parody background. The game does not encourage anyone to manipulate public opinion in real life. See the [Disclaimer](#disclaimer) at the end.

## A few terms

The satire relies on Chinese internet slang. Here is what the game's main tactics mean:

| In game | Literal | Meaning |
|---|---|---|
| 洗地 | "washing the ground" | Spinning or whitewashing a scandal |
| 水军 | "water army" | Paid commenters, astroturfing |
| 控评 | "controlling the comments" | Flooding and pinning comments so friendly takes dominate |
| 热搜 | "hot search" | The trending list on social platforms, which can be bought or pulled |
| 召唤铁拳 | "summoning the iron fist" | Reporting a rival to regulators or platforms to get them punished |
| 临时工 | "temp worker" | Blaming a low-level temp employee as the scapegoat |
| 告洋状 | "complaining to foreigners" | Taking a domestic dispute to foreign media or audiences |

## Features

- **Levels are separate from the engine**: a level is plain JSON validated against a schema. A visual **level editor** is included, with a condition builder, effect builder, live validation, one-click playtesting, import/export and one-sentence AI level generation.
- **A full stat system**: public sentiment, heat, credibility, exposure and client satisfaction. Six audience factions each have their own sensitivities. Short-term momentum is separate from long-term attitude: paid comments only buy time, real fixes solve the problem.
- **Truth and lie debt**: every accusation has the client's official line and a hidden truth. Denying something true adds lie debt, which blows up when the evidence comes out. Debunking a real rumor pays off when the truth is revealed.
- **18 tools**: official statements (AI drafting and review), paid commenters (AI writes comments in the direction you set), post deletion and throttling (describe in one sentence what to remove and AI picks the posts), comment control, pulling or buying trending topics, KOLs, lawyer's letters, **reporting rivals** (it only lands on real violations, and false reports backfire), counter-digging, sentiment monitoring, internal investigations, settlements, co-opting critics, blaming a temp worker, third-party endorsements, sincere reform, plus level-specific custom AI tools.
- **Opponents**: rival brands, groups of angry consumers, clickbait accounts and others, each with signature moves such as mass reporting, complaining to foreign media, riding the scandal for traffic, reporting you to regulators, digging up old records, spreading rumors, archiving screenshots and hiring their own trolls. They announce their intentions in advance, but you only see them clearly if you deploy sentiment monitoring.
- **Main and side quests**: stage progress unlocks higher tool tiers and extra budget. Optional side quests and last-minute client requests give bonus rewards.
- **Endings and saves**: each closed case gets an S–D rating plus an AI-written case report and a "three months later…" epilogue. Every run is saved automatically, several can be in progress at once, and finished runs stay in the archive, where you can review stat trends, a turn-by-turn record and every statement you published, or **turn the run into a web-novel-style story** (short or long, downloadable as .md).
- **Tutorial guide**: the tutorial level walks you through a whole run with step-by-step cards that highlight targets and offer sample drafts.
- **Playthrough check and auto-tuning**: the editor sweeps a level with dozens to hundreds of offline play styles and reports whether it can be won, whether it is too easy, whether every task can be completed, and whether the winning routes match the design intent. Auto-tune then patches the level round by round until it passes. No AI is called (also available as `node tests/run.js --check` / `--tune`).
- **Three difficulties**: The Invisible Hand (power fantasy: all skills unlocked with no use limits, stronger effects, reduced self-damage and exposure that fades over time), Full-Time Staff, and Gold-Medal PR.
- **AI is optional**: works with Claude (official SDK) and any OpenAI-compatible API (DeepSeek, Qwen, Kimi, Zhipu, Doubao, Gemini, Ollama, LM Studio…). All numbers are computed by the engine; AI only writes content and gives bounded scores. **The game is fully playable without AI**, since every AI feature has an offline rule-based fallback.
- **5 built-in levels**: a crayfish restaurant hygiene scandal (tutorial), an expired-ingredients scandal, a top celebrity's image collapse, a self-driving brake controversy, and a suspected moon-landing film studio.

## Quick start

The recommended way is the bundled local server (Python 3 standard library only). The start scripts open your browser automatically:

- **Windows**: double-click `start.bat`
- **Linux / macOS**: run `./start.sh` in a terminal

Both scripts take an optional port argument (default 8765), e.g. `start.bat 9000`. You can also start the server manually:

```bash
python tools/serve.py --open
```

The game is at <http://127.0.0.1:8765/Start.html> and the level editor at <http://127.0.0.1:8765/LevelEditor.html>.

You can also double-click `Start.html` to play offline, since all scripts are plain `<script>` tags with no server needed. Use the local server if you want AI features, or want the game and the editor to share settings and custom levels.

## Connecting an AI model

On the title screen, click 「AI 设置」 (AI Settings), pick a provider, enter the model and API key, then click 「测试连接」 (Test connection). When the game is opened through the start scripts, the key is kept by the local server by default (encrypted with DPAPI on Windows, stored in the system keyring on Linux), so no plaintext key stays in the browser. When you open the HTML file directly, the key is stored in the browser. If your provider blocks direct browser calls (CORS), start the game with `python tools/serve.py` and enable 「通过本地代理转发请求」 (forward requests through the local proxy). Details (Chinese): [docs/AI.md](docs/AI.md).

## Troubleshooting: the error log

Errors and warnings are recorded automatically in the 「🐞 异常」 (Errors) panel. The button is on the title screen, the in-game top bar and the editor top bar; the shortcut is `Ctrl+Shift+L`.

- A red badge appears on the button when there are new errors. An uncaught exception also shows a popup you can click to open the panel.
- Each entry can be expanded to show its stack trace and details. You can filter by errors only, errors and warnings, or everything.
- The last 100 errors and warnings are kept in the browser and survive a page reload (marked as the previous session).
- To report a problem, click 「导出 JSON」 (Export JSON) and send the file to the developer. It includes browser info and AI settings (provider, model, etc.) but **never the API key**.
- To see AI prompts and raw responses, open 「AI 调用日志」 (AI call log) in the panel. This part is kept in memory only and is cleared on reload.
- When the HTML is opened via `file://`, browsers hide script errors as "Script error." with no stack trace. For full stacks, start the game with `start.bat` / `start.sh` (or `python tools/serve.py`).
- Developers can also press F12 to open the console, where every entry is logged as usual.

## Making levels

Open `LevelEditor.html`. Start from a built-in level as a template or from scratch, fill in each section, watch the live validation in the right column, and click 「▶ 试玩」 (Playtest) to play right inside the editor. When you are done you can:

- 「保存到浏览器」 (Save to browser): the level shows up under custom levels in the game's level select.
- 「导出 JSON」 (Export JSON): share the file, and others load it with 「导入关卡」 (Import level) on the title screen.
- 「导出 JS」 (Export JS): put the file in `levels/` and add it to `levels/manifest.js` to make it a built-in level.

Format reference (Chinese): [docs/LevelFormat.md](docs/LevelFormat.md).

## Documentation

The in-depth docs are in Chinese only for now.

| Document | Contents |
|---|---|
| [docs/Architecture.md](docs/Architecture.md) | Layered architecture, module responsibilities, level loading, the turn loop, the AI pipeline, data model, editor, storage and security |
| [docs/Gameplay.md](docs/Gameplay.md) | Core loop, stats and formulas, factions, tool catalog, statements, truth and lie debt, reporting rivals, quests, opponents, difficulty, grading, balance data |
| [docs/LevelFormat.md](docs/LevelFormat.md) | Level JSON fields, the condition and effect DSL, opponents and skills, quests, custom AI tools, using the editor |
| [docs/AI.md](docs/AI.md) | Provider setup, the two adapters, the CORS proxy, prompts and the JSON protocol, error handling and fallbacks, cost, privacy |

## Project layout

```text
Start.html            Game entry point
LevelEditor.html      Level editor
css/                  Styles (common / game / editor)
js/core/              Namespace, error log, utilities, events, storage
js/data/              Default data: tools, skills, difficulties, factions, platforms, text pools
js/engine/            Engine (no DOM): schema, condition/effect DSL, opinion field, tools, evolution, truth, quests, opponents, scoring
js/llm/               AI: settings and adapters, task prompts, output schemas, offline rules
js/ui/                Game UI
js/editor/            Editor
levels/               Built-in levels (manifest.js + one file per level)
start.bat / start.sh  One-click start (Windows / Linux, macOS)
tools/serve.py        Local static server + LLM CORS proxy + API key custody
tools/keystore.py     Key storage backends (env var / DPAPI / keyring / 0600 file)
tests/run.js          Unit tests and automated balance simulation
docs/                 Documentation
```

## Tests

```bash
node tests/run.js
```

This runs the unit tests (including validation of every built-in level) and a quick balance simulation with bot strategies. More options:

```bash
node tests/run.js --balance 50 --diffs all
```

```bash
node tests/run.js --trace smart --level milktea --seed 3
```

The first runs a full balance report (50 games per cell, all three difficulties). The second prints the stats and log of a single game turn by turn.

To evaluate AI generation quality (bring your own key, or use `--mock` for a free self-check), see [docs/AI.md section 8](docs/AI.md#8-生成效果评测开发用) (Chinese):

```bash
node tests/eval/eval.js --mock
```

## Disclaimer

- **Fiction and satire**: this is a satirical simulation game. All characters, brands, organizations and events are fictional. Any real events, institutions or online platforms that appear are only parody background. They have nothing to do with any real person or organization and do not represent the author's opinion of them.
- **No real-world manipulation**: the game exaggerates tactics such as deleting posts, controlling comments, paid commenters and shifting blame, along with their costs, for the sake of satire and reflection. It is not a tutorial and does not encourage anyone to manipulate public opinion, spread rumors, infringe on others' rights or evade regulation in real life.
- **AI-generated content**: posts, levels, stories and other content are generated by the third-party model you configure in AI Settings. They may be inaccurate or inappropriate and are for entertainment only. Follow the terms of your model provider and your local laws. You are responsible for the content you generate, save, publish or share. Exported stories begin with this notice.
- **No warranty**: this project is provided "as is", without warranty of any kind. To the extent permitted by law, the authors and contributors are not liable for any loss arising from the use of this project or its generated content.
- **Modified versions and deployments**: whoever modifies, redistributes or deploys this project as an online service is responsible for that version. Please do not present modified versions under the name "公关洗地模拟器" (Whitewash Simulator).

## License

- Code (`js/`, `css/`, `*.html`, `tests/`, `tools/`, start scripts): [MIT](LICENSE).
- Text content (`levels/`, `docs/`, `README.md`, `README.en.md`): [CC BY 4.0](LICENSE-CONTENT).
- [NOTICE](NOTICE) summarizes the disclaimer above. Please keep it when distributing this project or derivative works.

Copyright 2026 brokenwing
