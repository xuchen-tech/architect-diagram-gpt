import * as vscode from 'vscode';
import { DiagramType, ExtensionConfig, StylePreset, getConfig, validateConfig } from './config';
import { ImageApiClient, saveImageToWorkspace } from './imageApi';
import { BuiltPrompt, buildImagePrompt, isMermaidContent } from './promptBuilder';

type PanelMessage =
  | { type: 'ready' }
  | { type: 'generate'; input: string; diagramType: DiagramType; stylePreset: StylePreset }
  | { type: 'save'; url: string }
  | { type: 'openSettings' }
  | { type: 'insertSample'; sample: 'mermaid' | 'text' };

type WebviewMessage =
  | { type: 'init'; config: Pick<ExtensionConfig, 'diagramType' | 'stylePreset' | 'size' | 'model'>; isConfigured: boolean }
  | { type: 'generating'; message: string }
  | { type: 'result'; url: string; revisedPrompt?: string; builtPrompt: BuiltPrompt }
  | { type: 'error'; message: string }
  | { type: 'saved'; path: string };

export class DiagramPanel {
  public static currentPanel: DiagramPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly apiClient: ImageApiClient;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    apiClient: ImageApiClient,
    initialInput?: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.apiClient = apiClient;

    this.panel.webview.html = this.getHtml(initialInput ?? '');

    this.panel.webview.onDidReceiveMessage(
      (message: PanelMessage) => void this.handleMessage(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.onPanelDisposed(), null, this.disposables);
  }

  private onPanelDisposed(): void {
    DiagramPanel.currentPanel = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  public static render(
    extensionUri: vscode.Uri,
    apiClient: ImageApiClient,
    initialInput?: string
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (DiagramPanel.currentPanel) {
      DiagramPanel.currentPanel.panel.reveal(column);
      if (initialInput) {
        DiagramPanel.currentPanel.setInput(initialInput);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'architectDiagramPanel',
      'Architect Diagram GPT',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    DiagramPanel.currentPanel = new DiagramPanel(panel, extensionUri, apiClient, initialInput);
  }

  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    apiClient: ImageApiClient
  ): void {
    DiagramPanel.currentPanel = new DiagramPanel(panel, extensionUri, apiClient);
  }

  private setInput(input: string): void {
    void this.postMessage({ type: 'setInput', input });
  }

  private async handleMessage(message: PanelMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.sendInit();
        break;
      case 'generate':
        await this.generate(message.input, message.diagramType, message.stylePreset);
        break;
      case 'save':
        await this.save(message.url);
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('architectDiagram.openSettings');
        break;
      case 'insertSample':
        this.setInput(this.getSample(message.sample));
        break;
    }
  }

  private async sendInit(): Promise<void> {
    const config = getConfig();
    await this.postMessage({
      type: 'init',
      config: {
        diagramType: config.diagramType,
        stylePreset: config.stylePreset,
        size: config.size,
        model: config.model,
      },
      isConfigured: Boolean(config.apiKey.trim() && config.apiBaseUrl.trim()),
    });
  }

  private async generate(
    input: string,
    diagramType: DiagramType,
    stylePreset: StylePreset
  ): Promise<void> {
    const config = getConfig();
    const validationError = validateConfig(config);
    if (validationError) {
      await this.postMessage({ type: 'error', message: validationError });
      return;
    }

    let built: BuiltPrompt;
    try {
      built = buildImagePrompt({
        input,
        diagramType,
        stylePreset,
        language: config.language,
        extraPrompt: config.extraPrompt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postMessage({ type: 'error', message });
      return;
    }

    await this.postMessage({
      type: 'generating',
      message: `正在生成${built.resolvedDiagramType === 'architecture' ? '架构' : ''}图（${built.inputKind === 'mermaid' ? 'Mermaid' : '文本'}）…`,
    });

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Architect Diagram GPT',
          cancellable: false,
        },
        async () => this.apiClient.generateImage(built.prompt)
      );

      await this.postMessage({
        type: 'result',
        url: result.url,
        revisedPrompt: result.revisedPrompt,
        builtPrompt: built,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postMessage({ type: 'error', message });
    }
  }

  private async save(url: string): Promise<void> {
    try {
      const saved = await saveImageToWorkspace(url);
      if (saved) {
        await this.postMessage({ type: 'saved', path: saved.fsPath });
        const open = '打开文件';
        const choice = await vscode.window.showInformationMessage(
          `架构图已保存：${saved.fsPath}`,
          open
        );
        if (choice === open) {
          await vscode.commands.executeCommand('vscode.open', saved);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postMessage({ type: 'error', message });
    }
  }

  private getSample(kind: 'mermaid' | 'text'): string {
    if (kind === 'mermaid') {
      return `\`\`\`mermaid
flowchart LR
    User[用户] --> Web[Web 前端]
    Web --> Gateway[API Gateway]
    Gateway --> Auth[认证服务]
    Gateway --> Order[订单服务]
    Gateway --> Product[商品服务]
    Order --> DB[(订单 DB)]
    Product --> Cache[(Redis 缓存)]
    Order --> MQ[消息队列]
    MQ --> Notify[通知服务]
\`\`\``;
    }

    return `电商微服务架构：
- 用户通过 Web/App 访问 API Gateway
- Gateway 路由到认证、订单、商品、支付四个微服务
- 订单服务写入 PostgreSQL，商品服务使用 Redis 缓存
- 支付完成后通过 Kafka 发送事件，通知服务消费并推送消息
- 所有服务部署在 Kubernetes 集群，前面有 Nginx Ingress`;
  }

  private postMessage(message: Record<string, unknown>): Thenable<boolean> {
    return this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    if (DiagramPanel.currentPanel === this) {
      DiagramPanel.currentPanel = undefined;
    }
    this.panel.dispose();
  }

  public static disposeCurrent(): void {
    DiagramPanel.currentPanel?.panel.dispose();
  }

  private getHtml(initialInput: string): string {
    const escapedInput = JSON.stringify(initialInput);
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Architect Diagram GPT</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, rgba(128,128,128,.35));
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --muted: var(--vscode-descriptionForeground);
      --error: var(--vscode-errorForeground);
      --success: var(--vscode-testing-iconPassed);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px 20px 24px;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 600;
    }
    .subtitle { color: var(--muted); margin-bottom: 16px; }
    .banner {
      display: none;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 12px;
      background: rgba(255, 180, 0, 0.08);
    }
    .banner.visible { display: block; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      align-items: center;
    }
    label { font-size: 12px; color: var(--muted); margin-right: 4px; }
    select, button, textarea {
      font: inherit;
      border-radius: 4px;
    }
    select {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      padding: 4px 8px;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 6px 12px;
      cursor: pointer;
    }
    button:hover { background: var(--btn-hover); }
    button.secondary {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    textarea {
      width: 100%;
      min-height: 220px;
      resize: vertical;
      padding: 12px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.6;
    }
    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
    }
    .panel {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      min-height: 280px;
    }
    .panel h2 {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .preview {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 240px;
      background: rgba(128,128,128,0.06);
      border-radius: 6px;
      overflow: hidden;
    }
    .preview img {
      max-width: 100%;
      max-height: 480px;
      object-fit: contain;
    }
    .placeholder { color: var(--muted); text-align: center; padding: 24px; }
    .status { margin-top: 8px; min-height: 20px; color: var(--muted); }
    .status.error { color: var(--error); }
    .status.success { color: var(--success); }
    .meta {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      word-break: break-all;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>Architect Diagram GPT</h1>
  <p class="subtitle">输入 Mermaid 或文字描述，使用 gpt-image-2-all 生成精美架构图 / 流程图</p>

  <div id="apiBanner" class="banner">
    尚未配置 API。请点击「设置」或在 VS Code 设置中填写 <code>architectDiagram.apiBaseUrl</code> 和 <code>architectDiagram.apiKey</code>。
  </div>

  <div class="toolbar">
    <label for="diagramType">图表类型</label>
    <select id="diagramType">
      <option value="auto">自动识别</option>
      <option value="architecture">架构图</option>
      <option value="flowchart">流程图</option>
      <option value="sequence">时序图</option>
      <option value="deployment">部署图</option>
      <option value="data-flow">数据流图</option>
    </select>

    <label for="stylePreset">风格</label>
    <select id="stylePreset">
      <option value="modern-flat">现代扁平</option>
      <option value="corporate-blue">商务蓝</option>
      <option value="dark-tech">暗色科技</option>
      <option value="minimal">极简</option>
      <option value="hand-drawn">手绘白板</option>
    </select>

    <button id="btnSampleMermaid" class="secondary">插入 Mermaid 示例</button>
    <button id="btnSampleText" class="secondary">插入文字示例</button>
    <button id="btnSettings" class="secondary">设置</button>
    <button id="btnGenerate">生成精美图片</button>
  </div>

  <div class="layout">
    <div>
      <div class="panel">
        <h2>输入（Mermaid / 文字）</h2>
        <textarea id="input" placeholder="粘贴 Mermaid 代码或系统架构文字描述…"></textarea>
      </div>
      <div id="status" class="status"></div>
      <div id="meta" class="meta"></div>
    </div>

    <div class="panel">
      <h2>预览</h2>
      <div id="preview" class="preview">
        <div class="placeholder">生成后将在此显示架构图</div>
      </div>
      <div class="actions">
        <button id="btnSave" disabled>保存到本地</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const inputEl = document.getElementById('input');
    const previewEl = document.getElementById('preview');
    const statusEl = document.getElementById('status');
    const metaEl = document.getElementById('meta');
    const btnGenerate = document.getElementById('btnGenerate');
    const btnSave = document.getElementById('btnSave');
    const diagramTypeEl = document.getElementById('diagramType');
    const stylePresetEl = document.getElementById('stylePreset');
    const apiBanner = document.getElementById('apiBanner');

    let currentUrl = '';

    inputEl.value = ${escapedInput};

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
          diagramTypeEl.value = msg.config.diagramType;
          stylePresetEl.value = msg.config.stylePreset;
          apiBanner.classList.toggle('visible', !msg.isConfigured);
          metaEl.textContent = '模型: ' + msg.config.model + ' | 尺寸: ' + msg.config.size;
          break;
        case 'setInput':
          inputEl.value = msg.input;
          break;
        case 'generating':
          btnGenerate.disabled = true;
          btnSave.disabled = true;
          statusEl.className = 'status';
          statusEl.textContent = msg.message;
          previewEl.innerHTML = '<div class="placeholder">生成中，请稍候…</div>';
          break;
        case 'result':
          btnGenerate.disabled = false;
          currentUrl = msg.url;
          btnSave.disabled = false;
          statusEl.className = 'status success';
          statusEl.textContent = '生成成功！类型: ' + msg.builtPrompt.resolvedDiagramType + ' | 来源: ' + msg.builtPrompt.inputKind;
          previewEl.innerHTML = '<img src="' + msg.url + '" alt="Generated diagram" />';
          if (msg.revisedPrompt) {
            metaEl.textContent = 'Revised prompt: ' + msg.revisedPrompt;
          }
          break;
        case 'error':
          btnGenerate.disabled = false;
          statusEl.className = 'status error';
          statusEl.textContent = msg.message;
          break;
        case 'saved':
          statusEl.className = 'status success';
          statusEl.textContent = '已保存: ' + msg.path;
          break;
      }
    });

    btnGenerate.addEventListener('click', () => {
      vscode.postMessage({
        type: 'generate',
        input: inputEl.value,
        diagramType: diagramTypeEl.value,
        stylePreset: stylePresetEl.value,
      });
    });

    btnSave.addEventListener('click', () => {
      if (currentUrl) {
        vscode.postMessage({ type: 'save', url: currentUrl });
      }
    });

    document.getElementById('btnSettings').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    document.getElementById('btnSampleMermaid').addEventListener('click', () => {
      vscode.postMessage({ type: 'insertSample', sample: 'mermaid' });
    });

    document.getElementById('btnSampleText').addEventListener('click', () => {
      vscode.postMessage({ type: 'insertSample', sample: 'text' });
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export async function generateFromEditor(
  apiClient: ImageApiClient,
  extensionUri: vscode.Uri,
  mode: 'selection' | 'document'
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('请先打开一个编辑器。');
    return;
  }

  const text =
    mode === 'selection'
      ? editor.document.getText(editor.selection)
      : editor.document.getText();

  if (!text.trim()) {
    void vscode.window.showWarningMessage(
      mode === 'selection' ? '请先选中 Mermaid 或文字内容。' : '当前文档为空。'
    );
    return;
  }

  const config = getConfig();
  const validationError = validateConfig(config);
  if (validationError) {
    const configure = '打开设置';
    const choice = await vscode.window.showErrorMessage(validationError, configure);
    if (choice === configure) {
      await vscode.commands.executeCommand('architectDiagram.openSettings');
    }
    return;
  }

  DiagramPanel.render(extensionUri, apiClient, text);

  if (isMermaidContent(text)) {
    void vscode.window.showInformationMessage('已载入选中内容，点击「生成精美图片」开始。');
  }
}
