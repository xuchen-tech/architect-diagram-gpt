import * as vscode from 'vscode';
import { getConfig, openSettings } from './config';
import { DiagramPanel, generateFromEditor } from './diagramPanel';
import { ImageApiClient } from './imageApi';
import { generateAndInsertInMarkdown } from './markdownInsert';

export function activate(context: vscode.ExtensionContext): void {
  const apiClient = new ImageApiClient(getConfig);

  context.subscriptions.push(
    vscode.commands.registerCommand('architectDiagram.openPanel', () => {
      DiagramPanel.render(context.extensionUri, apiClient);
    }),

    vscode.commands.registerCommand('architectDiagram.generateFromSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === 'markdown') {
        return generateAndInsertInMarkdown(apiClient);
      }
      return generateFromEditor(apiClient, context.extensionUri, 'selection');
    }),

    vscode.commands.registerCommand('architectDiagram.generateAndInsert', () =>
      generateAndInsertInMarkdown(apiClient)
    ),

    vscode.commands.registerCommand('architectDiagram.generateFromDocument', () =>
      generateFromEditor(apiClient, context.extensionUri, 'document')
    ),

    vscode.commands.registerCommand('architectDiagram.openSettings', () => openSettings())
  );
}

export function deactivate(): void {
  DiagramPanel.disposeCurrent();
}
