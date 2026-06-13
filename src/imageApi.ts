import * as vscode from 'vscode';
import { ExtensionConfig } from './config';

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size: string;
  n: number;
}

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
  created: number;
}

interface ApiResponse {
  created: number;
  data: Array<{
    url?: string;
    revised_prompt?: string;
    b64_json?: string;
  }>;
}

export class ImageApiClient {
  constructor(private readonly getConfig: () => ExtensionConfig) {}

  async generateImage(prompt: string): Promise<ImageGenerationResult> {
    const config = this.getConfig();
    const endpoint = `${config.apiBaseUrl}/v1/images/generations`;

    const body: ImageGenerationRequest = {
      model: config.model,
      prompt,
      size: config.size,
      n: 1,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法连接 API（${config.apiBaseUrl}）：${message}`);
    }

    const responseText = await response.text();
    let payload: ApiResponse | { error?: { message?: string } };

    try {
      payload = JSON.parse(responseText) as ApiResponse;
    } catch {
      throw new Error(
        `API 返回非 JSON 响应（HTTP ${response.status}）：${responseText.slice(0, 200)}`
      );
    }

    if (!response.ok) {
      const apiMessage =
        (payload as { error?: { message?: string } }).error?.message ??
        responseText.slice(0, 300);
      throw new Error(`图像生成失败（HTTP ${response.status}）：${apiMessage}`);
    }

    const first = (payload as ApiResponse).data?.[0];
    if (!first) {
      throw new Error('API 返回成功但未包含图像数据。');
    }

    if (first.url) {
      return {
        url: first.url,
        revisedPrompt: first.revised_prompt,
        created: (payload as ApiResponse).created,
      };
    }

    if (first.b64_json) {
      return {
        url: `data:image/png;base64,${first.b64_json}`,
        revisedPrompt: first.revised_prompt,
        created: (payload as ApiResponse).created,
      };
    }

    throw new Error('API 响应中缺少 url 或 b64_json 字段。');
  }
}

export async function downloadImage(url: string): Promise<Uint8Array> {
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1];
    if (!base64) {
      throw new Error('无效的 data URL。');
    }
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图片失败（HTTP ${response.status}）。`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function saveImageToWorkspace(
  url: string,
  suggestedName = 'architecture-diagram'
): Promise<vscode.Uri | undefined> {
  const bytes = await downloadImage(url);
  const defaultUri = vscode.Uri.file(
    `${suggestedName}-${Date.now()}.png`
  );

  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Images: ['png', 'webp', 'jpg', 'jpeg'] },
    saveLabel: '保存架构图',
  });

  if (!target) {
    return undefined;
  }

  await vscode.workspace.fs.writeFile(target, bytes);
  return target;
}
