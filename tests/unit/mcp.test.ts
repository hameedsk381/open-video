import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

describe('mcp server (Model Context Protocol)', () => {
  it('executes JSON-RPC handshake, tool listing, inspection and template catalogue', async () => {
    const file = resolve('examples/typography/composition.json');
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'motionrender_validate', arguments: { file } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'motionrender_inspect', arguments: { file } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'motionrender_list_templates', arguments: {} } },
    ];

    const responses: any[] = await new Promise((resolvePromise, reject) => {
      const proc = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'packages/cli/src/index.ts', 'mcp'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('close', () => {
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = lines.map(line => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        resolvePromise(parsed);
      });

      proc.on('error', reject);

      for (const req of requests) {
        proc.stdin.write(JSON.stringify(req) + '\n');
      }
      proc.stdin.end();
    });

    expect(responses).toHaveLength(5);
    const byId = new Map(responses.map((r: any) => [r.id, r]));

    // 1. initialize
    expect(byId.get(1)).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'motionrender' }
      }
    });

    // 2. tools/list
    const tools = byId.get(2)?.result?.tools;
    expect(Array.isArray(tools)).toBe(true);
    const names = tools.map((t: any) => t.name);
    expect(names).toContain('motionrender_create_video');
    expect(names).toContain('motionrender_render_video');
    expect(names).toContain('motionrender_render_still');
    expect(names).toContain('motionrender_review_video');
    expect(names).toContain('motionrender_validate');
    expect(names).toContain('motionrender_inspect');
    expect(names).toContain('motionrender_list_templates');
    expect(names).toContain('motionrender_refine_video');
    expect(names).toContain('motionrender_adapt_aspect');
    expect(names).toContain('motionrender_batch_render');
    expect(names).toContain('motionrender_transcribe_audio');
    expect(names).toContain('motionrender_import_figma');
    expect(names).toContain('motionrender_script');

    // 3. validate
    const valResp = byId.get(3);
    expect(valResp?.result?.isError).toBe(false);
    expect(valResp?.result?.content[0]?.text).toContain('Valid MotionRender composition');

    // 4. inspect
    const insResp = byId.get(4);
    expect(insResp?.result?.isError).toBe(false);
    const inspectJson = JSON.parse(insResp?.result?.content[0]?.text);
    expect(inspectJson.id).toBe('future-promo');
    expect(inspectJson.scenes).toHaveLength(1);

    // 5. list templates
    const tmplResp = byId.get(5);
    expect(tmplResp?.result?.isError).toBe(false);
    const tmplJson = JSON.parse(tmplResp?.result?.content[0]?.text);
    expect(tmplJson.templates.some((t: any) => t.id === 'social-reel')).toBe(true);
    expect(tmplJson.themes.some((th: any) => th.id === 'neon')).toBe(true);
  }, 20000);
});
