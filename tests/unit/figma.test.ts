import { describe, expect, it } from 'vitest';
import {
  figmaColorToHex,
  importFigmaTokens,
  importFigmaFrame,
} from '@ove/core';

describe('Figma Design System Bridge', () => {
  describe('figmaColorToHex', () => {
    it('converts normalized float RGB to hex', () => {
      expect(figmaColorToHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff');
      expect(figmaColorToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
      expect(figmaColorToHex({ r: 0.22, g: 0.74, b: 0.97 })).toBe('#38bdf7');
    });

    it('converts alpha transparency to rgba() string', () => {
      expect(figmaColorToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('handles undefined or invalid colors gracefully', () => {
      expect(figmaColorToHex(undefined)).toBe('#ffffff');
    });
  });

  describe('importFigmaTokens', () => {
    it('extracts theme tokens from Token Studio / W3C format', () => {
      const tokens = {
        color: {
          background: { $value: '#0f172a' },
          surface: { $value: '#1e293b' },
          primary: { $value: '#38bdf8' },
          text: { $value: '#f1f5f9' },
          muted: { $value: '#64748b' }
        },
        borderRadius: {
          card: { $value: 16 }
        }
      };

      const theme = importFigmaTokens(tokens, 'Acme SaaS');
      expect(theme.id).toBe('acme-saas');
      expect(theme.name).toBe('Acme SaaS');
      expect(theme.variables.bg).toBe('#0f172a');
      expect(theme.variables.surface).toBe('#1e293b');
      expect(theme.variables.accent).toBe('#38bdf8');
      expect(theme.variables.text).toBe('#f1f5f9');
      expect(theme.variables.radius).toBe(16);
    });

    it('extracts theme tokens from raw Figma document node tree', () => {
      const figmaDoc = {
        document: {
          name: 'Design System',
          children: [
            {
              name: 'Background Fill',
              type: 'RECTANGLE',
              fills: [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.1 } }]
            },
            {
              name: 'Brand Primary CTA',
              type: 'RECTANGLE',
              fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.8, b: 0.5 } }],
              cornerRadius: 14
            }
          ]
        }
      };

      const theme = importFigmaTokens(figmaDoc, 'Green Brand');
      expect(theme.variables.radius).toBe(14);
      expect(typeof theme.variables.bg).toBe('string');
      expect(typeof theme.variables.accent).toBe('string');
    });
  });

  describe('importFigmaFrame', () => {
    it('converts a Figma frame node into a validated MotionRender composition', () => {
      const frameNode = {
        id: '1:2',
        name: 'Hero Frame',
        type: 'FRAME',
        width: 1920,
        height: 1080,
        fills: [{ type: 'SOLID', color: { r: 0.03, g: 0.05, b: 0.09 } }],
        children: [
          {
            id: '1:3',
            name: 'Headline',
            type: 'TEXT',
            x: 200,
            y: 350,
            width: 800,
            height: 120,
            characters: 'Build Videos With Code',
            fontSize: 64,
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            textAlignHorizontal: 'LEFT'
          },
          {
            id: '1:4',
            name: 'Primary Button',
            type: 'RECTANGLE',
            x: 200,
            y: 520,
            width: 240,
            height: 64,
            cornerRadius: 12,
            fills: [{ type: 'SOLID', color: { r: 0.22, g: 0.74, b: 0.97 } }]
          }
        ]
      };

      const composition = importFigmaFrame(frameNode, { fps: 30, durationFrames: 90 });
      expect(composition.version).toBe('1.0');
      expect(composition.width).toBe(1920);
      expect(composition.height).toBe(1080);
      expect(composition.scenes).toHaveLength(1);

      const scene = composition.scenes[0]!;
      expect(scene.layers).toHaveLength(2);

      const textLayer = scene.layers.find(l => l.type === 'text') as any;
      expect(textLayer.content).toBe('Build Videos With Code');
      expect(textLayer.fontSize).toBe(64);
      expect(textLayer.color).toBe('#ffffff');

      const rectLayer = scene.layers.find(l => l.type === 'rect') as any;
      expect(rectLayer.width).toBe(240);
      expect(rectLayer.height).toBe(64);
      expect(rectLayer.radius).toBe(12);
      expect(rectLayer.fill).toBe('#38bdf7');
    });
  });
});

