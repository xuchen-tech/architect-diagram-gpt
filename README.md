# Architect Diagram GPT

**English** | [中文](./README.zh-CN.md)

VS Code extension that turns **Mermaid** or **plain-text descriptions** into polished architecture diagrams, flowcharts, deployment diagrams, and more — powered by the `gpt-image-2-all` image model.

Built for software architects who want publication-quality visuals for docs and slides, without the plain look of default Mermaid rendering.

## Features

- **Mermaid** (flowchart, sequenceDiagram, C4, etc.) and **plain text** input
- Auto-detect diagram type, or choose: architecture / flowchart / sequence / deployment / data-flow
- Visual style presets: modern flat, corporate blue, dark tech, minimal, hand-drawn whiteboard
- **Markdown workflow**: select content → right-click → generate, save, and insert image in one step
- Interactive panel for preview and manual save (non-Markdown files)
- Configurable API endpoint, output directory, filename prefix, and alt text

## Quick Start (Markdown)

1. Configure `architectDiagram.apiBaseUrl` and `architectDiagram.apiKey` in VS Code settings
2. Open a `.md` file and select a Mermaid block or architecture description
3. Right-click → **Architect Diagram: Generate Diagram and Insert Image**
4. The extension generates the image, saves it under `doc/images/` (configurable), and replaces the selection with:

   ```markdown
   ![Architecture diagram](../doc/images/diagram-1718280000000.png)
   ```

   Image paths are **relative to the current Markdown file** so preview works correctly.

## Installation & Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the **Extension Development Host** for debugging.

### Package as VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

Install the generated `.vsix` via **Extensions → Install from VSIX…**.

## Configuration

Open VS Code Settings and search for `Architect Diagram`, or edit `settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `architectDiagram.apiBaseUrl` | API base URL (no trailing slash) | *(empty, required)* |
| `architectDiagram.apiKey` | Bearer API key | *(empty, required)* |
| `architectDiagram.model` | Image model name | `gpt-image-2-all` |
| `architectDiagram.size` | Output size | `1536x1024` (landscape, recommended) |
| `architectDiagram.diagramType` | Default diagram type | `architecture` |
| `architectDiagram.stylePreset` | Visual style preset | `modern-flat` |
| `architectDiagram.language` | Label language in diagram | `zh-CN` |
| `architectDiagram.extraPrompt` | Extra instructions appended to every prompt | *(empty)* |
| `architectDiagram.imageOutputDir` | Save directory (relative to workspace root) | `doc/images` |
| `architectDiagram.imageFileNamePrefix` | Filename prefix (`{prefix}-{timestamp}.{ext}`) | `diagram` |
| `architectDiagram.imageAltText` | Alt text in inserted Markdown image | `架构图` |

Example:

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
  "architectDiagram.imageAltText": "System architecture"
}
```

## Usage

### 1. Markdown: generate & insert (recommended)

1. Select Mermaid or text in a Markdown file  
2. Right-click → **Generate Diagram and Insert Image**  
3. Wait for generation — the selection is replaced with an image reference

### 2. Open the generator panel

Command Palette (`Ctrl+Shift+P`) → **Architect Diagram: Open Diagram Generator**

Use the panel to paste input, pick diagram type and style, preview, and save manually.

### 3. From editor selection (non-Markdown)

1. Select Mermaid or text in any file  
2. Right-click → **Generate Diagram from Selection**  
3. Confirm in the panel and click **Generate**

## API

OpenAI-compatible image generation endpoint:

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

The generated image URL is returned in `data[0].url`.

## Commands

| Command | Description |
|---------|-------------|
| **Open Diagram Generator** | Open the main webview panel |
| **Generate Diagram and Insert Image** | Markdown: generate, save, and insert at selection |
| **Generate Diagram from Selection** | Load selection (Markdown: insert flow; others: open panel) |
| **Generate Diagram from Document** | Load entire document into the panel |
| **Open Settings** | Open extension settings |

## License

MIT
