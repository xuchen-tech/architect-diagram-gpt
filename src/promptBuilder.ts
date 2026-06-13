import { DiagramType, LabelLanguage, StylePreset } from './config';

const MERMAID_PATTERNS = [
  /^```mermaid/m,
  /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|C4Context|C4Container|C4Component)/m,
];

export type InputKind = 'mermaid' | 'text';

export interface PromptOptions {
  input: string;
  diagramType: DiagramType;
  stylePreset: StylePreset;
  language: LabelLanguage;
  extraPrompt?: string;
}

export interface BuiltPrompt {
  prompt: string;
  inputKind: InputKind;
  resolvedDiagramType: Exclude<DiagramType, 'auto'>;
}

const DIAGRAM_TYPE_LABELS: Record<Exclude<DiagramType, 'auto'>, string> = {
  architecture: 'system architecture diagram',
  flowchart: 'flowchart',
  sequence: 'sequence / interaction diagram',
  deployment: 'deployment / infrastructure diagram',
  'data-flow': 'data flow diagram',
};

const STYLE_DESCRIPTIONS: Record<StylePreset, string> = {
  'modern-flat':
    'Modern flat design, clean layout, rounded rectangles, subtle gradients, soft shadows, professional SaaS product style.',
  'corporate-blue':
    'Corporate presentation style, blue and white palette, clear hierarchy, suitable for executive slides.',
  'dark-tech':
    'Dark background (#1a1a2e), neon cyan/blue accents, tech startup aesthetic, high contrast labels.',
  minimal:
    'Minimal black and white, thin lines, maximum clarity, no decorative elements.',
  'hand-drawn':
    'Whiteboard hand-drawn sketch style, informal but clear, marker-like strokes.',
};

function detectMermaid(input: string): boolean {
  const trimmed = input.trim();
  return MERMAID_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function detectDiagramType(input: string, fallback: DiagramType): Exclude<DiagramType, 'auto'> {
  const lower = input.toLowerCase();

  if (fallback !== 'auto') {
    return fallback;
  }

  if (/sequencediagram|participant|->>|-->>/i.test(input)) {
    return 'sequence';
  }
  if (/flowchart|graph\s+(td|lr|tb|rl|bt)/i.test(input)) {
    return 'flowchart';
  }
  if (/c4context|c4container|c4component|deployment|k8s|kubernetes|aws|azure|gcp/i.test(input)) {
    return 'deployment';
  }
  if (/erdiagram|entity|database|data.?flow|pipeline/i.test(input)) {
    return 'data-flow';
  }
  if (/architecture|microservice|api gateway|service mesh|component/i.test(input)) {
    return 'architecture';
  }

  return 'architecture';
}

function resolveLanguage(input: string, language: LabelLanguage): 'zh-CN' | 'en' {
  if (language !== 'auto') {
    return language;
  }
  const hasChinese = /[\u4e00-\u9fff]/.test(input);
  return hasChinese ? 'zh-CN' : 'en';
}

function buildRequirements(
  diagramType: Exclude<DiagramType, 'auto'>,
  lang: 'zh-CN' | 'en'
): string {
  const common =
    lang === 'zh-CN'
      ? [
          '所有文字标签必须清晰可读，使用中文（专有名词可保留英文）。',
          '布局整齐，箭头方向明确，组件分组合理。',
          '不要添加与输入无关的装饰性元素或水印。',
          '输出为单张完整的专业信息图，适合架构师在文档或 PPT 中使用。',
        ]
      : [
          'All text labels must be crisp and readable in English.',
          'Neat layout, clear arrow directions, logical grouping of components.',
          'Do not add decorative elements or watermarks unrelated to the input.',
          'Output a single complete professional infographic suitable for architect documentation.',
        ];

  const typeSpecific: Record<Exclude<DiagramType, 'auto'>, string[]> = {
    architecture: [
      lang === 'zh-CN'
        ? '展示系统分层：客户端、网关、服务、数据存储等，用图标或色块区分组件类型。'
        : 'Show system layers: client, gateway, services, data stores; distinguish component types with icons or color blocks.',
    ],
    flowchart: [
      lang === 'zh-CN'
        ? '使用标准流程图符号：开始/结束（圆角矩形）、处理（矩形）、判断（菱形）。'
        : 'Use standard flowchart symbols: start/end (rounded rect), process (rectangle), decision (diamond).',
    ],
    sequence: [
      lang === 'zh-CN'
        ? '横向展示参与者生命线，按时间顺序排列消息调用。'
        : 'Show participant lifelines horizontally with messages in chronological order.',
    ],
    deployment: [
      lang === 'zh-CN'
        ? '展示部署节点、容器、网络边界和基础设施组件。'
        : 'Show deployment nodes, containers, network boundaries, and infrastructure components.',
    ],
    'data-flow': [
      lang === 'zh-CN'
        ? '突出数据实体、处理步骤和数据流向。'
        : 'Highlight data entities, processing steps, and data flow directions.',
    ],
  };

  return [...common, ...typeSpecific[diagramType]].map((line) => `- ${line}`).join('\n');
}

export function buildImagePrompt(options: PromptOptions): BuiltPrompt {
  const trimmed = options.input.trim();
  if (!trimmed) {
    throw new Error('输入内容不能为空。');
  }

  const inputKind: InputKind = detectMermaid(trimmed) ? 'mermaid' : 'text';
  const resolvedDiagramType = detectDiagramType(trimmed, options.diagramType);
  const lang = resolveLanguage(trimmed, options.language);
  const diagramLabel = DIAGRAM_TYPE_LABELS[resolvedDiagramType];
  const styleDesc = STYLE_DESCRIPTIONS[options.stylePreset];
  const requirements = buildRequirements(resolvedDiagramType, lang);

  const sourceSection =
    inputKind === 'mermaid'
      ? `The following Mermaid diagram defines the structure, nodes, relationships, and labels. Interpret it faithfully and render as a polished ${diagramLabel}:\n\n\`\`\`mermaid\n${stripMermaidFence(trimmed)}\n\`\`\``
      : `The following text describes a system or process. Extract entities, relationships, and flow, then render as a polished ${diagramLabel}:\n\n${trimmed}`;

  let prompt = [
    `Create a professional, publication-quality ${diagramLabel} for a software architect.`,
    '',
    `Visual style: ${styleDesc}`,
    '',
    sourceSection,
    '',
    'Requirements:',
    requirements,
  ].join('\n');

  if (options.extraPrompt?.trim()) {
    prompt += `\n\nAdditional instructions:\n${options.extraPrompt.trim()}`;
  }

  return { prompt, inputKind, resolvedDiagramType };
}

function stripMermaidFence(input: string): string {
  return input
    .replace(/^```(?:mermaid)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

export function isMermaidContent(input: string): boolean {
  return detectMermaid(input);
}
