import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionConfig, getConfig, validateConfig } from './config';
import { ImageApiClient, downloadImage } from './imageApi';
import { buildImagePrompt } from './promptBuilder';

export async function generateAndInsertInMarkdown(apiClient: ImageApiClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('请先打开 Markdown 文件。');
    return;
  }

  if (editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('此命令仅适用于 Markdown 文件。');
    return;
  }

  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage('请先选中 Mermaid 代码或文字描述。');
    return;
  }

  const input = editor.document.getText(editor.selection);
  if (!input.trim()) {
    void vscode.window.showWarningMessage('选中的内容为空。');
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

  let builtPrompt;
  try {
    builtPrompt = buildImagePrompt({
      input,
      diagramType: config.diagramType,
      stylePreset: config.stylePreset,
      language: config.language,
      extraPrompt: config.extraPrompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(message);
    return;
  }

  const selection = editor.selection;
  const markdownUri = editor.document.uri;
  let savedImageUri: vscode.Uri | undefined;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Architect Diagram GPT',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: '正在生成架构图…' });
        const result = await apiClient.generateImage(builtPrompt.prompt);

        progress.report({ message: '正在保存图片…' });
        savedImageUri = await saveImageForMarkdown(result.url, markdownUri, config);

        progress.report({ message: '正在插入 Markdown…' });
        const markdownSnippet = buildMarkdownImageSnippet(
          markdownUri,
          savedImageUri,
          config.imageAltText
        );

        const success = await editor.edit((editBuilder) => {
          editBuilder.replace(selection, markdownSnippet);
        });

        if (!success) {
          throw new Error('无法写入编辑器，请重试。');
        }
      }
    );

    if (savedImageUri) {
      const relativePath = getRelativeImagePath(markdownUri, savedImageUri);
      void vscode.window.showInformationMessage(`架构图已保存并插入：${relativePath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`生成失败：${message}`);
  }
}

async function saveImageForMarkdown(
  imageUrl: string,
  markdownUri: vscode.Uri,
  config: ExtensionConfig
): Promise<vscode.Uri> {
  const bytes = await downloadImage(imageUrl);
  const extension = inferImageExtension(imageUrl);
  const fileName = `${config.imageFileNamePrefix}-${Date.now()}.${extension}`;
  const outputDir = await resolveOutputDirectory(markdownUri, config.imageOutputDir);
  const imageUri = vscode.Uri.joinPath(outputDir, fileName);

  await vscode.workspace.fs.createDirectory(outputDir);
  await vscode.workspace.fs.writeFile(imageUri, bytes);
  return imageUri;
}

async function resolveOutputDirectory(
  markdownUri: vscode.Uri,
  configuredDir: string
): Promise<vscode.Uri> {
  const normalizedDir = configuredDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalizedDir) {
    throw new Error('请配置 architectDiagram.imageOutputDir（图片保存目录）。');
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(markdownUri);
  if (workspaceFolder) {
    return vscode.Uri.joinPath(workspaceFolder.uri, ...normalizedDir.split('/'));
  }

  if (markdownUri.scheme === 'file') {
    return vscode.Uri.file(path.join(path.dirname(markdownUri.fsPath), ...normalizedDir.split('/')));
  }

  throw new Error('无法确定图片保存目录，请将 Markdown 文件保存在工作区内。');
}

function inferImageExtension(imageUrl: string): string {
  if (imageUrl.startsWith('data:image/')) {
    const match = /^data:image\/(\w+)/.exec(imageUrl);
    if (match?.[1] === 'jpeg') {
      return 'jpg';
    }
    if (match?.[1]) {
      return match[1];
    }
  }

  try {
    const pathname = new URL(imageUrl).pathname.toLowerCase();
    if (pathname.endsWith('.webp')) {
      return 'webp';
    }
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'jpg';
    }
    if (pathname.endsWith('.png')) {
      return 'png';
    }
  } catch {
    // ignore invalid URL, fall back to png
  }

  return 'png';
}

function buildMarkdownImageSnippet(
  markdownUri: vscode.Uri,
  imageUri: vscode.Uri,
  altText: string
): string {
  const relativePath = getRelativeImagePath(markdownUri, imageUri);
  return `![${altText}](${relativePath})`;
}

function getRelativeImagePath(markdownUri: vscode.Uri, imageUri: vscode.Uri): string {
  if (markdownUri.scheme !== 'file' || imageUri.scheme !== 'file') {
    return imageUri.fsPath.replace(/\\/g, '/');
  }

  const markdownDir = path.dirname(markdownUri.fsPath);
  const relative = path.relative(markdownDir, imageUri.fsPath);
  return relative.split(path.sep).join('/');
}
