import { compositionSchema, type Composition } from '@ove/schema';

export type FigmaColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

export function figmaColorToHex(color?: FigmaColor, opacity = 1): string {
  if (!color || typeof color.r !== 'number') return '#ffffff';
  const r = Math.round(Math.max(0, Math.min(1, color.r)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, color.g)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, color.b)) * 255);
  const a = color.a !== undefined ? color.a * opacity : opacity;

  if (a < 0.999) {
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
  }
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export type FigmaImportedTheme = {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string | number>;
};

/**
 * Extracts design tokens (colors, typography, radii) from a Figma styles/variables JSON
 * or raw Figma file response, producing a standard MotionRender Theme object.
 */
export function importFigmaTokens(input: any, themeName = 'Figma Brand'): FigmaImportedTheme {
  const variables: Record<string, string | number> = {
    bg: '#0b1020',
    surface: 'rgba(255, 255, 255, 0.06)',
    text: '#f8fafc',
    muted: '#94a3b8',
    accent: '#38bdf8',
    accent2: '#818cf8',
    radius: 12,
    headWeight: 800,
  };

  if (!input || typeof input !== 'object') {
    return {
      id: 'figma-theme',
      name: themeName,
      description: 'Extracted from Figma design tokens',
      variables,
    };
  }

  // Handle Token Studio format / W3C Design Tokens ({ [name]: { $value, $type } })
  const scanTokenStudio = (obj: any, prefix = '') => {
    for (const [key, val] of Object.entries(obj)) {
      if (!val || typeof val !== 'object') continue;
      const lower = key.toLowerCase();
      const fullPath = `${prefix}${lower}`;
      const currentVal = (val as any).$value ?? (val as any).value;
      const valType = (val as any).$type ?? (val as any).type;

      if (typeof currentVal === 'string' || typeof currentVal === 'number') {
        const strVal = String(currentVal).trim();
        const isColor = strVal.startsWith('#') || strVal.startsWith('rgb') || strVal.startsWith('hsl') || valType === 'color';

        const isRadius = typeof currentVal === 'number' && /(?:radius|corner|rounded)/i.test(fullPath);
        if (isRadius) {
          variables.radius = Number(currentVal) || 12;
        } else if (isColor) {
          if (/(?:^|[._-])(?:bg|background|canvas)(?:[._-]|$)/i.test(fullPath) || /(?:bg|background|canvas)/i.test(key)) variables.bg = strVal;
          else if (/(?:surface|panel)/i.test(fullPath)) variables.surface = strVal;
          else if (/(?:card)/i.test(fullPath) && !isRadius) variables.surface = strVal;
          else if (/(?:primary|accent|brand)/i.test(fullPath)) variables.accent = strVal;
          else if (/(?:secondary|highlight)/i.test(fullPath)) variables.accent2 = strVal;
          else if (/(?:muted|sub|caption)/i.test(fullPath)) variables.muted = strVal;
          else if (/(?:text|foreground)/i.test(fullPath)) variables.text = strVal;
        } else if (/weight|bold/i.test(fullPath)) {
          variables.headWeight = Number(currentVal) || 800;
        }
      } else {
        scanTokenStudio(val, `${prefix}${key}.`);
      }
    }
  };

  // Handle raw Figma File response ({ document: { children: [...] }, styles: { ... } })
  const scanFigmaNodes = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const name = String(node.name || '').toLowerCase();

    // Check fills
    if (Array.isArray(node.fills)) {
      const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false && f.color);
      if (solid?.color) {
        const hex = figmaColorToHex(solid.color, solid.opacity);
        if (/bg|background|canvas|screen/i.test(name)) variables.bg = hex;
        else if (/surface|card|box|panel/i.test(name)) variables.surface = hex;
        else if (/accent|primary|cta|brand/i.test(name)) variables.accent = hex;
        else if (/secondary|accent2|highlight/i.test(name)) variables.accent2 = hex;
        else if (/muted|subtext|caption/i.test(name)) variables.muted = hex;
        else if (/text|title|heading/i.test(name) && !variables.text) variables.text = hex;
      }
    }

    if (typeof node.cornerRadius === 'number') {
      variables.radius = node.cornerRadius;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(scanFigmaNodes);
    }
  };

  if (input.document) {
    scanFigmaNodes(input.document);
  } else {
    scanTokenStudio(input);
  }

  const id = themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'figma-theme';

  return {
    id,
    name: themeName,
    description: 'Imported from Figma design tokens and styles',
    variables,
  };
}

export type FigmaFrameImportOptions = {
  fps?: number;
  durationFrames?: number;
};

/**
 * Converts a Figma frame node into a validated MotionRender composition with text, shape,
 * and container layers.
 */
export function importFigmaFrame(frameNode: any, options: FigmaFrameImportOptions = {}): Composition {
  if (!frameNode || typeof frameNode !== 'object') {
    throw new Error('importFigmaFrame: invalid frameNode object');
  }

  const width = Math.round(Number(frameNode.absoluteBoundingBox?.width || frameNode.width || 1920));
  const height = Math.round(Number(frameNode.absoluteBoundingBox?.height || frameNode.height || 1080));
  const fps = options.fps ?? 30;
  const durationFrames = options.durationFrames ?? 90;

  // Background color from frame fills
  let bgColor = '#0b1020';
  if (Array.isArray(frameNode.fills)) {
    const bgFill = frameNode.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false && f.color);
    if (bgFill) bgColor = figmaColorToHex(bgFill.color, bgFill.opacity);
  }

  const layers: any[] = [];
  const parentBox = frameNode.absoluteBoundingBox || { x: 0, y: 0 };

  const processNode = (node: any) => {
    if (!node || node.visible === false) return;
    const box = node.absoluteBoundingBox || {
      x: parentBox.x + (node.x || 0),
      y: parentBox.y + (node.y || 0),
      width: node.width || 0,
      height: node.height || 0,
    };
    const relX = Math.round(box.x - parentBox.x);
    const relY = Math.round(box.y - parentBox.y);
    const nodeWidth = Math.round(box.width);
    const nodeHeight = Math.round(box.height);

    if (node.type === 'TEXT') {
      const fill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false && f.color);
      const color = figmaColorToHex(fill?.color, fill?.opacity);
      const fontSize = Math.round(node.style?.fontSize || node.fontSize || 32);
      const fontFamily = node.style?.fontFamily || node.fontName?.family || 'Inter';
      const fontWeight = node.style?.fontWeight || 600;
      const align = (node.style?.textAlignHorizontal || node.textAlignHorizontal || 'LEFT').toLowerCase();
      const content = String(node.characters || node.name || 'Text').trim();

      layers.push({
        id: `text-${node.id?.replace(/[^a-z0-9]/gi, '_') || layers.length + 1}`,
        type: 'text',
        content,
        x: align === 'center' ? relX + nodeWidth / 2 : relX,
        y: relY,
        width: nodeWidth,
        maxWidth: nodeWidth || Math.round(width * 0.8),
        fontFamily,
        fontSize,
        fontWeight,
        color,
        textAlign: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left',
      });
    } else if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP') {
      const fill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false && f.color);
      const stroke = node.strokes?.find((s: any) => s.type === 'SOLID' && s.visible !== false && s.color);

      // Only add non-empty visual rects
      if (fill || stroke) {
        layers.push({
          id: `rect-${node.id?.replace(/[^a-z0-9]/gi, '_') || layers.length + 1}`,
          type: 'rect',
          x: relX,
          y: relY,
          width: nodeWidth,
          height: nodeHeight,
          fill: fill ? figmaColorToHex(fill.color, fill.opacity) : undefined,
          stroke: stroke ? figmaColorToHex(stroke.color, stroke.opacity) : undefined,
          strokeWidth: node.strokeWeight,
          radius: node.cornerRadius,
        });
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(processNode);
      }
    } else if (node.type === 'ELLIPSE') {
      const fill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false && f.color);
      if (fill) {
        layers.push({
          id: `circle-${node.id?.replace(/[^a-z0-9]/gi, '_') || layers.length + 1}`,
          type: 'circle',
          x: Math.round(relX + nodeWidth / 2),
          y: Math.round(relY + nodeHeight / 2),
          radius: Math.round(Math.min(nodeWidth, nodeHeight) / 2),
          fill: figmaColorToHex(fill.color, fill.opacity),
        });
      }
    }
  };

  if (Array.isArray(frameNode.children)) {
    frameNode.children.forEach(processNode);
  }

  return compositionSchema.parse({
    version: '1.0',
    id: `figma-${String(frameNode.name || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: frameNode.name || 'Figma Video',
    width,
    height,
    fps,
    durationFrames,
    background: {
      type: 'linear',
      from: [0, 0],
      to: [width, height],
      stops: [
        { offset: 0, color: bgColor },
        { offset: 1, color: '#030712' },
      ],
    },
    export: { format: 'mp4', codec: 'h264' },
    scenes: [
      {
        id: 'main',
        name: frameNode.name || 'Main Scene',
        startFrame: 0,
        durationFrames,
        camera: { x: width / 2, y: height / 2, zoom: 1 },
        layers,
      },
    ],
  });
}

/**
 * Fetches a Figma file directly from the Figma REST API.
 */
export async function fetchFigmaFile(fileKey: string, accessToken: string): Promise<any> {
  const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`, {
    headers: {
      'X-Figma-Token': accessToken,
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Figma API error (${res.status} ${res.statusText}): ${errorText}`);
  }
  return res.json();
}
