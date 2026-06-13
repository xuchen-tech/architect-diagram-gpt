# Architect Diagram GPT

[English](./README.md) | **中文**

VS Code 插件：将 **Mermaid** 或 **文字描述** 转换为精美的架构图、流程图、部署图等，通过 `gpt-image-2-all` 图像模型生成。

适合架构师在分析代码或系统设计后，快速产出可用于文档、PPT 的高质量信息图，替代样式较朴素的 Mermaid 渲染效果。

## 功能

- 支持 **Mermaid**（flowchart、sequenceDiagram、C4 等）和 **纯文字** 输入
- 自动识别图表类型，或手动选择：架构图 / 流程图 / 时序图 / 部署图 / 数据流图
- 多种视觉风格：现代扁平、商务蓝、暗色科技、极简、手绘白板
- **Markdown 工作流**：选中内容 → 右键 → 一键生成、保存并插入图片
- 非 Markdown 文件可使用面板预览并手动保存
- 可配置 API 地址、图片存放目录、文件名前缀、alt 文本

## 快速开始（Markdown）

1. 在 VS Code 设置中配置 `architectDiagram.apiBaseUrl` 和 `architectDiagram.apiKey`
2. 打开 `.md` 文件，选中 Mermaid 代码块或架构描述文字
3. 右键 → **Architect Diagram: Generate Diagram and Insert Image**
4. 插件生成图片，保存到 `doc/images/`（可配置），并将选中内容替换为：

   ```markdown
   ![架构图](../doc/images/diagram-1718280000000.png)
   ```

   图片路径**相对于当前 Markdown 文件**计算，预览可正常显示。

## 安装与开发

```bash
npm install
npm run compile
```

在 VS Code 中按 `F5` 启动 **Extension Development Host** 进行调试。

### 打包为 VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

通过 **扩展 → 从 VSIX 安装…** 安装生成的文件。

## 配置

打开 VS Code 设置，搜索 `Architect Diagram`，或编辑 `settings.json`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `architectDiagram.apiBaseUrl` | API 基础地址（不含末尾 `/`） | 空（必填） |
| `architectDiagram.apiKey` | Bearer Token | 空（必填） |
| `architectDiagram.model` | 模型名称 | `gpt-image-2-all` |
| `architectDiagram.size` | 图片尺寸 | `1536x1024`（横版，适合架构图） |
| `architectDiagram.diagramType` | 默认图表类型 | `architecture` |
| `architectDiagram.stylePreset` | 视觉风格 | `modern-flat` |
| `architectDiagram.language` | 图中标签语言 | `zh-CN` |
| `architectDiagram.extraPrompt` | 附加生成指令 | 空 |
| `architectDiagram.imageOutputDir` | 图片保存目录（相对工作区根目录） | `doc/images` |
| `architectDiagram.imageFileNamePrefix` | 文件名前缀 | `diagram` |
| `architectDiagram.imageAltText` | 插入 Markdown 时的 alt 文本 | `架构图` |

示例：

```json
{
  "architectDiagram.apiBaseUrl": "https://your-api-host.example",
  "architectDiagram.apiKey": "sk-your-api-key",
  "architectDiagram.model": "gpt-image-2-all",
  "architectDiagram.size": "1536x1024",
  "architectDiagram.diagramType": "auto",
  "architectDiagram.stylePreset": "corporate-blue",
  "architectDiagram.imageOutputDir": "doc/images",
  "architectDiagram.imageFileNamePrefix": "architecture",
  "architectDiagram.imageAltText": "系统架构图"
}
```

## 使用方式

### 1. Markdown：生成并插入（推荐）

1. 在 Markdown 文件中选中 Mermaid 或文字  
2. 右键 → **Generate Diagram and Insert Image**  
3. 等待生成完成，选中内容会被替换为图片引用

### 2. 打开生成面板

命令面板（`Ctrl+Shift+P`）→ **Architect Diagram: Open Diagram Generator**

在面板中粘贴内容、选择图表类型和风格、预览并手动保存。

### 3. 从编辑器选区生成（非 Markdown）

1. 在任意文件中选中 Mermaid 或文字  
2. 右键 → **Generate Diagram from Selection**  
3. 在面板中确认并点击 **生成精美图片**

## API 说明

插件调用 OpenAI 兼容的图像生成接口：

```http
POST {apiBaseUrl}/v1/images/generations
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "gpt-image-2-all",
  "prompt": "...",
  "size": "1536x1024",
  "n": 1
}
```

响应中的 `data[0].url` 即为生成图片地址。

## 命令列表

| 命令 | 说明 |
|------|------|
| **Open Diagram Generator** | 打开主面板 |
| **Generate Diagram and Insert Image** | Markdown：生成、保存并插入 |
| **Generate Diagram from Selection** | 从选区生成（Markdown 走插入流程，其他打开面板） |
| **Generate Diagram from Document** | 从整篇文档载入面板 |
| **Open Settings** | 打开插件设置 |

## 许可证

MIT
