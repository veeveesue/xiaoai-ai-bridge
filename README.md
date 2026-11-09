# XiaoAI AI Bridge

让小爱音箱保留原生音乐、天气和提醒，并把普通聊天交给 DeepSeek 等兼容 Chat Completions 的模型。

**实验版 v0.1.0。** 目前仅在小爱音箱 Play 增强版 L05C 上实测；其他型号需要核对 MIoT 动作编号。本项目运行在电脑上，音箱继续使用小米云端语音识别。电脑需保持开机、联网和唤醒。

## 来源与致谢

本项目在 [idootop/migpt-next](https://github.com/idootop/migpt-next) 的示例与协议接入基础上开发，使用 Del Wang / idootop 提供的 [`@mi-gpt/miot`](https://www.npmjs.com/package/@mi-gpt/miot) 1.2.2 访问小米语音及 MIoT 服务。原开发基线为 `81c6442`。这是独立整理的衍生项目，不是上游官方版本，也不代表小米官方。

本仓库新增了原生/AI 路由、能力表、取消旧轮次、问题待办、英语播报试验、有限连续接话、配置隔离与单实例保护。没有复制原项目的完整提交历史、个人配置或实机对话日志。

保留上游 [MIT LICENSE](LICENSE) 及原版权声明；同时原样保留上游附带的 [用户协议](docs/UPSTREAM-AGREEMENT.md)。该协议含学术研究/个人测试及非商业用途表述，与 MIT 的许可范围存在表述差异；保留文件不表示差异已获得澄清。本项目目前定位为个人实验，不宣称已取得额外的商业授权。

## 能做到什么

- 原生“小爱同学”唤醒后获取问题，由 AI 回答并交音箱播报。
- 保留最近六轮 AI 对话；进程重启后清空。
- 音乐、中文实时天气、提醒及家电指令按规则交原生；分流不等于设备执行成功。
- 支持电脑主动播报、问题候选自动记录和语音补记。
- 可选自然英语播报和最多三次自动接话，默认关闭。
- 详细能力见 [CAPABILITIES.md](CAPABILITIES.md)，已知限制和优化顺序见 [项目评估](docs/PROJECT-REVIEW.md)。

## 快速开始

需要 Node.js 22 或以上、小米账号、支持的音箱及模型 API Key。无需 Python。

```sh
npm ci
npm test
mkdir -p ~/.config/xiaoai-poc
chmod 700 ~/.config/xiaoai-poc
```

首次配置：将 `speaker.example.json`、`model.example.json` 分别复制为该目录下的 `speaker.json`、`model.json`，权限设为 `600`。已有文件时请编辑而不要覆盖。填写设备 DID、小米账号与密码或 passToken，以及模型 Key。不要提交这些文件。

```sh
npm run check        # 只检查配置字段是否存在
npm run check:model  # 发送一次短模型请求，会产生 API 费用
npm start
```

首次小米认证可能需要账号验证；当前程序关闭 SDK 日志以避免认证链接和凭据泄露，遇到验证需求应在可信本机环境排查。启动后重新唤醒提问，启动前的历史问题不会回放。

```sh
npm run echo                   # 仅验证识别与复述，不调用模型
npm run say -- "这是一段测试播报"
```

## 配置与隐私

配置目录默认 `~/.config/xiaoai-poc/`，数据目录默认 `~/.local/share/xiaoai-poc/`。可用 `POC_CONFIG_DIR`、`POC_DATA_DIR` 更换位置。

模型覆盖项：`POC_API_BASE`、`POC_API_KEY`、`POC_MODEL`；小米覆盖项：`POC_MI_DID`、`POC_MI_USER_ID`、`POC_MI_PASSWORD`、`POC_MI_PASS_TOKEN`。

`englishReplyMode` 默认 `direct`；可选 `native-translation`：模型用中文生成回应，再由小爱静默翻译并播放英文，最终措辞由小米服务决定。`POC_ENGLISH_MODE=direct` 可回退。

`continuousTrial` 默认 `false`；设为 `true` 或 `POC_CONTINUOUS=1` 开启有限连续接话。播放结束只能估时，最多接续三次。可说“结束对话”关闭。型号默认动作 `tts=[5,3]`、`wake=[5,1]`、`execute=[5,4]` 仅针对 L05C。

问题文本会经过小米云，AI 路由的问题与近期 AI 对话会发往所配置模型服务。运行日志、问题待办也可能含私人对话：自动识别和密钥掩码并非完整隐私过滤器，不要公开运行数据。

`device-cache/.mi.json` 是认证缓存；`issues.json` 和 `TODO.md` 是问题待办；`service.pid` 是实例锁。迁移电脑时安全转移配置，不要复制运行锁；缓存可能需要重新登录。程序目前没有长期记忆、每日记忆归档或 AI 联网工具。

## 后台运行

`npm start` 是前台进程。生产化托管、日志轮换与健康监测尚未打包为跨平台安装器。macOS 可自行用 LaunchAgent 托管并配置 `RunAtLoad` / `KeepAlive`，使用 Node 与入口的绝对路径，日志放在私有数据目录；先停止已有实例，避免重复启动。休眠时无法保证服务工作。

## 开发

```sh
npm test
```

测试覆盖分流、取消、内部翻译回声、待办、配置、锁和媒体暂停逻辑；通过单元测试不代表实机没有漏音。测试不读取私人配置，不调用云端、不播放音频。修改能力后同步 `poc-capabilities.mjs` 和生成的能力表。

请勿在 Issue / PR 上传账号、密钥、认证缓存、完整语音记录或个人设备 ID。见 [SECURITY.md](SECURITY.md)。
