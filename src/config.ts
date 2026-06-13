import * as vscode from 'vscode';

export type DiagramType =
  | 'architecture'
  | 'flowchart'
  | 'sequence'
  | 'deployment'
  | 'data-flow'
  | 'auto';

export type StylePreset =
  | 'modern-flat'
  | 'corporate-blue'
  | 'dark-tech'
  | 'minimal'
  | 'hand-drawn';

export type LabelLanguage = 'zh-CN' | 'en' | 'auto';

export interface ExtensionConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
  diagramType: DiagramType;
  stylePreset: StylePreset;
  language: LabelLanguage;
  extraPrompt: string;
  imageOutputDir: string;
  imageFileNamePrefix: string;
  imageAltText: string;
}

const CONFIG_SECTION = 'architectDiagram';

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    apiBaseUrl: (config.get<string>('apiBaseUrl') ?? '').replace(/\/+$/, ''),
    apiKey: config.get<string>('apiKey') ?? '',
    model: config.get<string>('model') ?? 'gpt-image-2-all',
    size: config.get<'1024x1024' | '1536x1024' | '1024x1536'>('size') ?? '1536x1024',
    diagramType: config.get<DiagramType>('diagramType') ?? 'architecture',
    stylePreset: config.get<StylePreset>('stylePreset') ?? 'modern-flat',
    language: config.get<LabelLanguage>('language') ?? 'zh-CN',
    extraPrompt: config.get<string>('extraPrompt') ?? '',
    imageOutputDir: config.get<string>('imageOutputDir') ?? 'doc/images',
    imageFileNamePrefix: config.get<string>('imageFileNamePrefix') ?? 'diagram',
    imageAltText: config.get<string>('imageAltText') ?? '架构图',
  };
}

export function validateConfig(config: ExtensionConfig): string | undefined {
  if (!config.apiKey.trim()) {
    return '请先在设置中配置 architectDiagram.apiKey（API Key）。';
  }
  if (!config.apiBaseUrl.trim()) {
    return '请先在设置中配置 architectDiagram.apiBaseUrl（API 地址）。';
  }
  return undefined;
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:architect-diagram-gpt architectDiagram'
  );
}

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      callback();
    }
  });
}
