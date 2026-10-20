## Language
Always reply and write reports in Chinese (简体中文) unless I explicitly ask for English. Code identifiers and comments can stay in English.

## Environment (Windows)
- Do NOT use bash heredocs to write files containing backslashes, JSON payloads, or .bat content. Use the Write tool instead.

## Debugging & design discipline
- On a recognition or behavior bug, find the root cause before adding data or patches.

## Plan Rule

计划是写给人审阅的，不是写给自己执行的。用户应该能在 1 分钟内看懂要做什么、为什么做、影响什么、怎么验证。

每份计划依次包含以下部分：

1. **问题**：现在哪里不对，或者缺了什么。说清现象和原因，不要只写结论。
2. **改动**：打算怎么改，用自然语言描述思路和关键决策。如果有多个方案，说明为什么选了这个。
3. **步骤**：任务较大时，拆成可以独立验证的小步，每一步做完都能停下来检查。小任务可以省略这一项。
4. **影响范围**：会改哪些文件或模块，可能波及哪些功能、接口和数据。如果有破坏性变更或不可逆操作，要单独标出来。
5. **验证方式**：用什么证明改对了，比如具体的测试、命令、手动检查步骤和预期结果。
6. **待确认**：计划依赖了哪些假设，比如「这个字段不会为空」「旧接口已无人调用」，以及有哪些问题需要用户决定。没有就写「无」。
7. **实现备注**：claude需要的部分，人不需要看的部分

写法要求：
- 正文用人能读懂的语言，不要堆砌代码、diff 或长段伪代码。
- 函数名、具体实现细节、代码片段等只供自己执行时参考的内容，放到末尾的「实现备注」里，或者干脆不写进计划。