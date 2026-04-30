# Obsidian TTS 插件 PRD

版本：v0.1 draft  
日期：2026-04-30  
状态：供 review  
项目代号：Obsidian TTS  

## 1. 背景

用户希望在 Obsidian 中直接朗读当前笔记正文，降低长文阅读、复盘和移动端听笔记的成本。第一版关键目标是离线可朗读、正文提取准确、至少支持中文和英文，而不是追求复杂音色或在线模型能力。插件需要符合 Obsidian 社区插件规范，并支持桌面端和 Android 端。

当前仓库为全新项目，目录中已有一份本地语音资源：

- `voice.zip`：约 433.42 MB。
- `voice/`：解压后约 598.33 MB，包含 `bdetts`、`msctts`、`sougou` 三类资源。
- `voice/config.yaml`：包含约 145 条语音配置项。
- 资源文件类型包括 `.dat`、`.jet`、`.bin`、`.png`，更像 Android 离线 TTS 引擎资源包，而不是可直接由 Obsidian TypeScript 插件执行的模型。

## 2. 参考资源可用性结论

### 2.1 Coqui TTS

参考链接：[coqui-ai/TTS](https://github.com/coqui-ai/TTS)

结论：适合作为“可选自托管后端”参考，不建议直接嵌入 Obsidian 插件。

原因：

- Coqui TTS 是 Python/PyTorch 深度学习 TTS 工具链，README 显示安装方式是 `pip install TTS`，并提供 Docker 服务方式。
- GitHub 仓库最新 release 为 `v0.22.0`，发布时间为 2023-12-12。
- 仓库 license 为 MPL-2.0。
- Coqui 公司已在 2024 年初关停，社区 issue 中也持续讨论维护状态和授权问题。
- 运行模型通常需要较大依赖、模型文件和算力，不适合直接放入 Obsidian 插件，尤其不适合 Android 移动端插件运行环境。

PRD 采纳方式：

- 不把 Coqui 作为内置引擎。
- 设计一个 `HTTP TTS Provider` 适配层，允许用户连接自己部署的 Coqui 服务。
- 文档中提供“Coqui 服务端配置示例”，但插件本体只负责发送文本、接收音频和播放。

### 2.2 MultiTTS

参考链接：[MrRettich/MultiTTS](https://github.com/MrRettich/MultiTTS)

结论：只适合作为批量文本转语音流程参考，不适合作为插件核心。

原因：

- MultiTTS README 显示其核心是 Python 脚本，通过 ElevenLabs API 把 `.txt` 转成 `.mp3`。
- 项目规模小，GitHub 显示仅 7 次 commit，无发布版本。
- 依赖互联网和 ElevenLabs API key，不满足默认本地/离线朗读诉求。
- 可参考其“输入文本目录 -> 生成音频文件 -> 输出目录”的批处理思路，用于后续“整篇笔记导出音频”功能。

## 3. 产品目标

### 3.1 MVP 目标

1. 在 Obsidian 中离线朗读当前打开笔记的正文内容，默认不依赖互联网。
2. 支持桌面端和 Android 端，插件 `manifest.json` 中 `isDesktopOnly` 必须为 `false`。
3. 提供基础播放控制：播放、暂停、继续、停止、上一段、下一段。
4. 支持从阅读模式和编辑模式准确提取正文。
5. 支持按标题、段落、列表项对文本分段朗读。
6. 至少支持中文和英文朗读，能处理同一篇笔记中的中英文混排。
7. 支持系统 TTS 引擎作为默认方案，优先使用系统已安装的离线语音。
8. 提供语音、语速、音调、音量设置。
9. 默认不打包大型语音包；如需要提供默认语音包，只允许轻量包，包含 1 种音色，最多 2 种音色（1 男 1 女）。
10. 项目工程符合 Obsidian 插件规范，包含 TypeScript、ESLint、构建脚本和发布产物规范。

### 3.2 V1 目标

1. 强化离线朗读稳定性，完成桌面端和 Android 端实机验证。
2. 支持朗读选中文本、当前标题下正文、当前笔记全文。
3. 支持朗读进度记忆和恢复。
4. 支持跳过 YAML frontmatter、代码块、Dataview 代码、图片链接等非正文内容。
5. 优化中英文混排文本切分、数字/英文缩写/链接显示文本的朗读准确性。
6. 预留语音包和外部 TTS provider 扩展接口，但不把下载、自定义安装作为 V1 核心交付。

### 3.3 V2 目标

1. 支持整篇笔记导出为音频文件。
2. 支持批量把文件夹内笔记转成音频。
3. 支持播放列表和稍后听队列。
4. 支持更精细的正文清洗规则。
5. 支持外部 HTTP TTS 服务配置，例如用户自托管 Coqui、Piper、Edge TTS 兼容服务。
6. 支持自定义语音包下载、安装、启用、禁用、删除。
7. 支持从本地 `voice.zip` 导入语音包。
8. 支持语音包市场或订阅源。
9. 支持跨设备同步语音包元数据，语音包大文件本身默认不同步。

## 4. 非目标

以下内容不进入 MVP：

- 不内置 Python、PyTorch、Coqui 模型运行时。
- 不内置 ElevenLabs API key 或任何第三方商业服务凭证。
- 不保证 `voice/` 目录里的所有现有资源都能直接合成语音。
- 不把自定义语音包下载、安装、语音包市场作为 MVP/V1 核心功能。
- 不把 433 MB 的 `voice.zip` 或 598 MB 的 `voice/` 作为默认内置语音包。
- 不绕过 Android 或 Obsidian 插件沙箱调用系统私有 API。
- 不做实时语音克隆。
- 不在插件内执行从语音包下载的任意代码，语音包必须是数据包。

## 5. 用户画像与场景

### 5.1 桌面长文阅读用户

用户在电脑上写作、整理材料或阅读长笔记，希望边听边检查语义、错别字和结构。

关键需求：

- 快速从命令面板启动朗读。
- 能暂停、继续、跳段。
- 能设置语速和声音。
- 能跳过代码块和属性区。

### 5.2 Android 移动端听笔记用户

用户在通勤、散步或做家务时，希望在手机 Obsidian 中朗读笔记。

关键需求：

- 插件必须能在 Android Obsidian 启用。
- 操作入口要适合触屏。
- 不中断 Obsidian 基础使用。
- 网络差时至少能使用系统 TTS。

### 5.3 高质量语音用户

用户对声音质量、中文表现或特定音色有要求，希望后续安装额外语音包或连接自托管 TTS 服务。该场景不进入 MVP/V1 主线，只作为接口预留和长期扩展方向。

关键需求：

- 能在未来导入本地语音包。
- 能在未来从 URL 下载语音包。
- 能看到语音包来源、大小、版本、兼容引擎。
- 能试听并设为默认声音。

## 6. 核心产品设计

### 6.1 入口

插件提供以下入口：

- Ribbon 图标：启动/停止当前笔记朗读。
- 命令面板：
  - `TTS: Read current note`
  - `TTS: Read selection`
  - `TTS: Read current section`
  - `TTS: Pause / Resume`
  - `TTS: Stop`
  - `TTS: Open voice settings`
- 状态栏：显示当前朗读状态和进度。
- 设置页：管理系统 TTS、语音、语速、正文清洗规则；语音包和外部 provider 只预留扩展入口。

### 6.2 朗读范围

MVP 支持：

- 当前笔记全文。
- 当前选中文本。
- 当前光标所在标题段落。

V1 支持：

- 从当前光标继续朗读。
- 从某个标题开始朗读。
- 只朗读正文，自动跳过 frontmatter、代码块、嵌入块、HTML 块。

### 6.3 文本解析与清洗

正文提取规则：

- 去除 YAML frontmatter。
- 默认跳过 fenced code block。
- 默认跳过 Dataview、Tasks、Templater 等代码块。
- 图片、PDF、音频嵌入默认读 alt text 或文件名，可配置为跳过。
- Obsidian wikilink 默认读显示文本；没有显示文本时读页面名。
- Markdown 链接默认读显示文本。
- 表格默认按行读取，可配置跳过。
- Callout 默认读标题和正文，可配置仅读正文。
- 中英文混排时保留英文单词、数字、缩写和专有名词，不做会改变含义的强行翻译或拼音化。

### 6.4 分段策略

朗读前将正文切分为 chunk：

- 优先按标题、段落、列表项、句号、问号、感叹号切分。
- 单个 chunk 默认不超过 500-800 个中文字符。
- 中英文混排文本按自然句切分，避免把英文单词、URL、数字、小数、缩写切断。
- 对系统 TTS 使用较短 chunk，减少移动端中断风险。
- 对 HTTP TTS 的批量预合成只作为 V2+ 扩展。

### 6.5 播放控制

基础控制：

- 播放。
- 暂停。
- 继续。
- 停止。
- 上一段。
- 下一段。
- 调整语速。
- 调整音量。
- 切换声音。

状态：

- `idle`
- `preparing`
- `speaking`
- `paused`
- `stopped`
- `error`

### 6.6 进度与恢复

MVP：

- 当前 session 内记录正在朗读的 chunk index。
- 停止后可从头开始。

V1：

- 按文件记录最近朗读位置。
- 支持“从上次位置继续”。
- 支持设置是否保存朗读历史。

## 7. TTS 引擎设计

### 7.1 引擎分层

插件采用引擎抽象，不把语音包和合成逻辑绑死：

```ts
interface TtsEngine {
  id: string;
  name: string;
  platform: Array<"desktop" | "android" | "ios">;
  listVoices(): Promise<TtsVoice[]>;
  speak(input: SpeakRequest): Promise<SpeakResult>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  stop(): Promise<void>;
  supportsVoicePack?(pack: VoicePackManifest): boolean;
}
```

### 7.2 System TTS Engine

定位：MVP/V1 默认引擎，也是第一版离线朗读的主路径。

实现方式：

- 使用浏览器/WebView 可用的 `speechSynthesis` 和 `SpeechSynthesisUtterance`。
- 不依赖 Node.js、Electron 或本地二进制。
- 桌面端和 Android 端都先做可用性检测。
- 优先枚举 `zh-CN`、`zh-Hans`、`en-US`、`en-GB` 等系统 voice，至少选择一套中文和英文可用 voice。
- 如果同一系统 voice 可同时朗读中英文，则允许使用单一默认 voice；如果系统中中英文 voice 分离，则按 chunk 语言选择 voice。
- 默认不下载云端语音；离线能力取决于用户系统或 Android TTS 引擎是否已安装离线语音数据。

限制：

- 声音列表由系统提供，插件不能直接把任意语音包加载进系统 TTS。
- Android WebView 中 `speechSynthesis` 行为需要实机验证。
- 生成音频缓存和导出音频能力有限。

### 7.3 HTTP TTS Engine

定位：V2+ 高质量语音和自托管模型方案，MVP/V1 只保留接口设计，不作为默认功能。

实现方式：

- 用户配置 endpoint、鉴权方式、默认 voice、模型参数。
- 插件通过 `fetch` 发送文本。
- 服务返回 `audio/mpeg`、`audio/wav` 或 `audio/ogg`。
- 插件使用 Web Audio 或 `HTMLAudioElement` 播放。

适配对象：

- 自托管 Coqui TTS 服务。
- Piper/ONNX TTS 服务。
- Edge TTS 兼容代理。
- 用户自定义 API。

优势：

- 移动端也可以通过网络调用。
- 避免在插件中打包大型模型和 Python 依赖。
- 适合后续做音频缓存和导出。

风险：

- 隐私：正文会发送到配置的服务。
- 网络：离线不可用。
- 鉴权：需要安全保存 token。

### 7.4 Voice Pack Engine

定位：V2+ 的语音包管理与未来本地合成扩展，MVP/V1 只做接口预留。

重要约束：

- 语音包必须是数据包，不能包含可执行脚本。
- 插件只安装、校验、索引语音包。
- 语音包是否能合成声音，取决于是否存在兼容的 engine adapter。

本地 `voice/` 资源初步判断：

- `bdetts`、`msctts`、`sougou` 资源可能来自 Android 侧离线 TTS 引擎生态。
- 这些文件本身不是 WebAssembly 或 JavaScript 可直接执行模型。
- `config.yaml` 中中文名存在 mojibake，需要后续确认原始编码或重新生成元数据。
- 需要做技术 spike：确认文件格式、授权来源、运行时依赖、是否可被开源插件合法分发。

### 7.5 默认语音包策略

第一版优先使用系统 TTS，不默认打包项目中的 `voice.zip` 或完整 `voice/` 目录。

如果后续确实需要提供内置离线语音包，必须满足：

- 只包含一种默认音色；最多允许两种音色（1 男 1 女）。
- 必须同时覆盖中文和英文朗读需求，或明确说明英文由系统 TTS fallback。
- 包体尽量小，作为轻量默认包，不引入数百 MB 级资源。
- 可删除、可替换，不影响系统 TTS 主路径。
- 必须确认模型、语音和资源文件的授权可分发。

## 8. 语音包管理

### 8.1 语音包安装方式

MVP/V1 只预留设置入口和数据结构，V2+ 再实现：

- 从 URL 下载 `.zip` 语音包。
- 从本地 vault 路径选择 `.zip` 语音包。
- 从项目已有 `voice.zip` 导入。
- 从已解压目录导入。

### 8.2 语音包 manifest

每个语音包必须包含 `voice-pack.json`：

```json
{
  "schemaVersion": 1,
  "id": "example-zh-pack",
  "name": "Example Chinese Voice Pack",
  "version": "1.0.0",
  "vendor": "example",
  "license": "unknown",
  "engine": {
    "type": "http|wasm|native-reference|system-alias",
    "adapter": "example-adapter",
    "minAdapterVersion": "1.0.0"
  },
  "voices": [
    {
      "id": "xiaoming",
      "name": "Xiaoming",
      "locale": "zh-CN",
      "gender": "neutral",
      "sampleRate": 24000,
      "files": ["models/xiaoming.bin"]
    }
  ],
  "checksum": {
    "algorithm": "sha256",
    "value": "..."
  }
}
```

### 8.3 安装流程

1. 用户选择下载 URL 或本地 zip。
2. 插件检查文件大小、hash、manifest。
3. 插件解包或复制到插件数据目录。
4. 插件索引 voices。
5. 插件判断当前平台是否有兼容 engine。
6. 兼容时允许试听和启用。
7. 不兼容时显示“已安装但当前平台不可用”。

### 8.4 下载安全

要求：

- 下载前显示文件大小、来源 URL、license、兼容引擎。
- 支持 SHA-256 校验。
- 不执行语音包内脚本。
- 不允许语音包覆盖插件代码。
- 支持删除和清理缓存。

## 9. Android 兼容要求

必须满足：

- `manifest.json` 中 `isDesktopOnly: false`。
- 运行时代码不使用 Node.js `fs`、`path`、`child_process`。
- 运行时代码不使用 Electron API。
- 使用 Obsidian API 和 Web API 完成文件读取、网络请求和音频播放。
- 所有核心交互适配触屏。
- 大文件下载必须有进度、取消和失败恢复。
- HTTP TTS 请求应支持超时和重试。

需要实机验证：

- Android Obsidian 中 `speechSynthesis` 是否可用。
- Android WebView 音频播放是否受后台/锁屏限制。
- 插件数据目录大文件写入能力。
- 从移动端 vault 选择本地 zip 的体验。

## 10. 工程规范

### 10.1 技术栈

- TypeScript。
- Obsidian API。
- esbuild。
- ESLint。
- npm scripts。

### 10.2 必备文件

项目必须包含：

- `manifest.json`
- `versions.json`
- `package.json`
- `tsconfig.json`
- `esbuild.config.mjs`
- `eslint.config.mjs` 或 `.eslintrc`
- `src/main.ts`
- `src/settings.ts`
- `src/tts/`
- `src/voice-packs/`
- `styles.css`
- `README.md`

### 10.3 npm scripts

建议：

```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "lint": "eslint src --ext .ts",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  }
}
```

### 10.4 Obsidian manifest 要求

`manifest.json` 必须包含 Obsidian 要求字段：

```json
{
  "id": "tts",
  "name": "TTS",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Read Obsidian notes aloud with system voices and optional custom TTS providers.",
  "author": "Luna",
  "authorUrl": "",
  "isDesktopOnly": false
}
```

注意：

- 插件 ID 不能包含 `obsidian`。
- 本地开发时插件目录名应与 `id` 一致。
- 发布产物至少包含 `main.js`、`manifest.json`，如有样式则包含 `styles.css`。

## 11. 设置项

### 11.1 General

- 默认朗读范围：当前笔记、选中文本、当前标题。
- 启动行为：从头朗读、从光标朗读、从上次位置继续。
- 是否保存朗读历史。

### 11.2 Voice

- 默认 TTS 引擎。
- 默认 voice。
- 语速。
- 音调。
- 音量。
- 中文/英文混合文本处理策略。

### 11.3 Content Cleanup

- 跳过 frontmatter。
- 跳过代码块。
- 跳过表格。
- 跳过图片嵌入。
- 跳过链接 URL。
- Callout 朗读策略。

### 11.4 Voice Packs

V2+ 扩展设置，MVP/V1 仅保留占位或隐藏入口：

- 已安装语音包列表。
- 安装语音包。
- 从 URL 下载。
- 从 zip 导入。
- 删除语音包。
- 重新索引。
- 查看兼容性。

### 11.5 HTTP Provider

V2+ 扩展设置，MVP/V1 只保留接口设计：

- Endpoint。
- Method。
- Header。
- Auth token。
- Voice 参数。
- Model 参数。
- 返回音频格式。
- 超时设置。

## 12. 数据结构

### 12.1 PluginSettings

```ts
interface PluginSettings {
  defaultEngineId: string;
  defaultVoiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
  defaultScope: "note" | "selection" | "section";
  cleanup: CleanupSettings;
  voicePacks: InstalledVoicePack[];
  httpProviders: HttpTtsProviderSettings[];
  playbackHistory: Record<string, PlaybackPosition>;
}
```

### 12.2 SpeakRequest

```ts
interface SpeakRequest {
  text: string;
  voiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
  signal?: AbortSignal;
}
```

### 12.3 PlaybackPosition

```ts
interface PlaybackPosition {
  filePath: string;
  chunkIndex: number;
  updatedAt: string;
}
```

## 13. 验收标准

### 13.1 MVP 验收

- `npm run lint` 通过。
- `npm run build` 通过。
- 插件可在 Obsidian 桌面端启用。
- `manifest.json` 中 `isDesktopOnly` 为 `false`。
- 断网状态下，当前笔记正文可通过系统 TTS 朗读。
- 断网状态下，选中文本可通过系统 TTS 朗读。
- 中文笔记、英文笔记、中英文混排笔记均可朗读。
- frontmatter、代码块、Dataview 代码块等非正文内容默认不会被误读。
- 支持暂停、继续、停止。
- 设置页可切换 voice、语速、音量。
- 默认不依赖 `voice.zip` 或 `voice/` 目录，不内置数百 MB 级语音包。
- 不使用 Node/Electron runtime API。
- Android 实机至少完成系统 TTS 可用性验证；如不可用，需要给出明确降级提示。

### 13.2 V1 验收

- 桌面端和 Android 端离线朗读路径均完成验证。
- 中英文 voice 选择和 fallback 策略可配置。
- 正文清洗规则覆盖 frontmatter、代码块、链接、图片嵌入、表格、callout。
- 支持从光标所在段落或标题继续朗读。
- 支持从上次位置继续朗读。
- 语音包和 HTTP provider 的接口边界已预留，但下载、导入、自托管 provider 不要求交付。

### 13.3 V2+ 验收

- 可导入本地 `voice.zip`。
- 可从 URL 下载语音包。
- 可解析 `voice-pack.json`。
- 可列出已安装语音包与 voices。
- 可识别“不兼容当前平台”的语音包。
- HTTP TTS provider 可播放返回音频。
- 支持音频缓存。
- 默认内置语音包如果存在，必须是轻量包，只包含 1 种音色，最多 2 种音色。

## 14. 里程碑

### M0：项目脚手架

- 初始化 Obsidian 插件结构。
- 配置 TypeScript、esbuild、ESLint。
- 建立 release 产物规范。

### M1：系统 TTS MVP

- 实现正文提取。
- 实现 chunk 切分。
- 实现系统 TTS 播放控制。
- 实现设置页基础项。
- 完成中文、英文、中英文混排朗读样例。
- 验证断网状态下可朗读。

### M2：Android 可用性

- Android Obsidian 实机测试。
- 修复 WebView 兼容问题。
- 优化触屏操作。
- 验证 Android 系统 TTS 离线语音可用性和缺失时的提示。

### M3：离线朗读质量完善

- 完善正文清洗准确性。
- 完善中英文语言识别与 voice fallback。
- 实现按文件保存和恢复朗读进度。

### M4：语音包管理

- 实现语音包 manifest。
- 实现 zip 导入和 URL 下载。
- 实现安装、删除、索引、兼容性检查。

### M5：HTTP TTS Provider

- 实现通用 HTTP provider。
- 提供 Coqui 自托管配置示例。
- 实现音频播放和缓存。

### M6：本地 voice 资源 spike

- 分析 `voice/` 文件格式。
- 修复或重建 `config.yaml` 元数据。
- 确认授权风险。
- 判断是否能实现 adapter。

## 15. 风险与待确认问题

1. Android Obsidian 中 `speechSynthesis` 是否稳定可用。
2. 本地 `voice/` 资源是否有合法授权可用于插件分发。
3. `.dat`、`.jet`、`.bin` 文件是否有可用的 JS/WASM 或 HTTP engine adapter。
4. 大型语音包是否应放在 vault 中，还是插件私有数据目录中。
5. 语音包是否要参与 Obsidian Sync；默认建议不同步大文件，只同步元数据。
6. 如果用户配置远程 TTS provider，正文隐私提示需要做到多明确。
7. 是否需要支持 iOS；本 PRD 当前只明确要求 Android。

## 16. 推荐技术路线

推荐采用渐进式路线：

1. 先做系统 TTS MVP，确保桌面和 Android 可离线朗读。
2. 同时把引擎接口设计好，避免后续重构。
3. 优先完善正文清洗、中英文混排、系统 voice fallback 和 Android 实机体验。
4. 再做语音包管理，但语音包先作为“可安装资源”而不是“必然可朗读资源”。
5. 后续支持 HTTP TTS provider，把 Coqui 放到插件外部自托管。
6. 最后单独评估现有 `voice/` 资源是否能适配。

这个路线能最快交付可用、离线、准确的朗读能力，同时保留高质量语音和自定义语音包扩展空间。

## 17. 参考资料

- [Obsidian Manifest 官方文档](https://docs.obsidian.md/Reference/Manifest)
- [Obsidian Versions 官方文档](https://docs.obsidian.md/Reference/Versions)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Coqui TTS](https://github.com/coqui-ai/TTS)
- [Coqui TTS releases](https://github.com/coqui-ai/TTS/releases)
- [Coqui shutdown/community discussion issue](https://github.com/coqui-ai/TTS/issues/3488)
- [MultiTTS](https://github.com/MrRettich/MultiTTS)
