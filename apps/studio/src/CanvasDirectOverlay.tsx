import { useEffect, useMemo, useRef, useState } from 'react';
import { type Detail } from './api';
import { CheckIcon, ShieldIcon, Spinner } from './ui';

import { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem, type SafeZoneCollision } from './safeZone';
export { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem, type SafeZoneCollision };

/** Traverses composition scenes & layers at currentFrame to extract visible text layers with canvas coordinates. */
export function extractCanvasTextItems(detail: Detail, currentFrame: number): CanvasTextItem[] {
  const raw = detail.source.raw as any;
  if (!raw || !Array.isArray(raw.scenes)) return [];

  const compWidth = Number(raw.width) || 1920;
  const compHeight = Number(raw.height) || 1080;
  const items: CanvasTextItem[] = [];

  for (let sIdx = 0; sIdx < raw.scenes.length; sIdx++) {
    const scene = raw.scenes[sIdx];
    const sStart = Number(scene.startFrame) || 0;
    const sDur = Number(scene.durationFrames) || 1;
    if (currentFrame < sStart || currentFrame >= sStart + sDur) continue;

    const walkLayers = (layers: any[], basePath: string, offsetX: number, offsetY: number) => {
      if (!Array.isArray(layers)) return;
      for (let lIdx = 0; lIdx < layers.length; lIdx++) {
        const layer = layers[lIdx];
        if (!layer || layer.visible === false) continue;
        const currentPath = `${basePath}[${lIdx}]`;

        // Check layer timing within scene
        const lStart = Number(layer.startFrame) || 0;
        const lEnd = layer.endFrame !== undefined ? Number(layer.endFrame) : Infinity;
        const sceneLocalFrame = currentFrame - sStart;
        if (sceneLocalFrame < lStart || sceneLocalFrame >= lEnd) continue;

        if (layer.type === 'group') {
          const gx = Number(layer.x) || 0;
          const gy = Number(layer.y) || 0;
          walkLayers(layer.children, `${currentPath}.children`, offsetX + gx, offsetY + gy);
        } else if (layer.type === 'text') {
          let content = typeof layer.content === 'string' ? layer.content : '';
          if (!content && Array.isArray(layer.spans)) {
            content = layer.spans.map((sp: any) => sp.text || '').join('');
          }
          if (!content.trim()) continue;

          let varName: string | undefined;
          const varMatch = content.match(/^\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}$/);
          if (varMatch) varName = varMatch[1];

          // If template variable, resolve value from variables
          if (varName && raw.variables?.[varName]?.default !== undefined) {
            const def = raw.variables[varName].default;
            if (typeof def === 'string') content = def;
          }

          const lx = (Number(layer.x) || 0) + offsetX;
          const ly = (Number(layer.y) || 0) + offsetY;
          const fontSize = Number(layer.fontSize) || 48;
          const fontFamily = layer.fontFamily || 'Inter';
          const fontWeight = Number(layer.fontWeight) || 400;
          const textAlign: 'left' | 'center' | 'right' = layer.textAlign || 'left';
          const maxWidth = Number(layer.maxWidth) || 0;

          const estCharWidth = fontSize * 0.56;
          const estTextWidth = Math.max(120, Math.min(compWidth - Math.max(0, lx), content.length * estCharWidth));
          const w = maxWidth > 0 ? maxWidth : estTextWidth;
          const lines = maxWidth > 0 ? Math.max(1, Math.ceil((content.length * estCharWidth) / maxWidth)) : 1;
          const h = Math.max(fontSize * 1.3, lines * fontSize * 1.3);

          let boxX = lx;
          if (textAlign === 'center') boxX = lx - w / 2;
          else if (textAlign === 'right') boxX = lx - w;
          const boxY = Math.max(0, ly - fontSize * 0.2);

          const leftPct = Math.max(1, Math.min(95, (boxX / compWidth) * 100));
          const topPct = Math.max(1, Math.min(95, (boxY / compHeight) * 100));
          const widthPct = Math.max(4, Math.min(98 - leftPct, (w / compWidth) * 100));
          const heightPct = Math.max(2.5, Math.min(98 - topPct, (h / compHeight) * 100));

          items.push({
            id: layer.id || `text-${items.length + 1}`,
            path: currentPath,
            sceneId: scene.id,
            sceneName: scene.name,
            content,
            x: boxX,
            y: boxY,
            width: w,
            height: h,
            leftPct,
            topPct,
            widthPct,
            heightPct,
            fontSize,
            fontFamily,
            fontWeight,
            textAlign,
            variableName: varName,
          });
        }
      }
    };

    walkLayers(scene.layers, `scenes[${sIdx}].layers`, 0, 0);
  }

  return items;
}

export function CanvasDirectOverlay({
  detail,
  currentFrame,
  selectedPath,
  onSelectPath,
  onSaveText,
  onSnapLayers,
  disabled = false,
}: {
  detail: Detail;
  currentFrame: number;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  onSaveText: (path: string, content: string, variableName?: string) => Promise<void>;
  onSnapLayers?: (moves: { path: string; dx: number; dy: number }[]) => Promise<void>;
  disabled?: boolean;
}) {
  const compWidth = Number(detail.width) || 1080;
  const compHeight = Number(detail.height) || 1920;
  const items = useMemo(() => extractCanvasTextItems(detail, currentFrame), [detail, currentFrame]);

  // Real-time safe zone collision detection map
  const collisions = useMemo(() => {
    const map = new Map<string, SafeZoneCollision | null>();
    for (const it of items) {
      map.set(it.path, checkSafeZoneCollision(it, compWidth, compHeight));
    }
    return map;
  }, [items, compWidth, compHeight]);

  const itemsWithViolations = useMemo(
    () => items.filter(it => collisions.get(it.path) !== null),
    [items, collisions]
  );

  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [saving, setSaving] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [snappingAll, setSnappingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => items.find(i => i.path === selectedPath) ?? null, [items, selectedPath]);
  const selectedCollision = selectedItem ? collisions.get(selectedItem.path) : null;

  useEffect(() => {
    if (selectedItem) {
      setEditingText(selectedItem.content);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selectedItem]);

  if (disabled || !items.length) return null;

  const handleSave = async () => {
    if (!selectedItem || saving) return;
    const trimmed = editingText.trim();
    if (!trimmed || trimmed === selectedItem.content) {
      onSelectPath(null);
      return;
    }
    setSaving(true);
    try {
      await onSaveText(selectedItem.path, trimmed, selectedItem.variableName);
      onSelectPath(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSnap = async () => {
    const move = selectedItem && selectedCollision ? resolveSafeZone(selectedItem, compWidth, compHeight) : null;
    if (!selectedItem || !move || !onSnapLayers || snapping) return;
    setSnapping(true);
    try {
      await onSnapLayers([{ path: selectedItem.path, ...move }]);
    } finally {
      setSnapping(false);
    }
  };

  const handleSnapAll = async () => {
    if (!onSnapLayers || snappingAll || !itemsWithViolations.length) return;
    const moves = itemsWithViolations.flatMap(item => { const move = resolveSafeZone(item, compWidth, compHeight); return move ? [{ path: item.path, ...move }] : []; });
    if (!moves.length) return;
    setSnappingAll(true);
    try {
      await onSnapLayers(moves);
    } finally {
      setSnappingAll(false);
    }
  };

  return (
    <div
      className="canvas-direct-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Top Warning Banner when elements intrude into platform UI safe zones */}
      {itemsWithViolations.length > 0 ? (
        <div
          className="safe-zone-alert-pill"
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--amber)',
            borderRadius: 20,
            padding: '4px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--amber)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 25,
            pointerEvents: 'auto',
          }}
        >
          <ShieldIcon size={13} />
          <span>{itemsWithViolations.length} element{itemsWithViolations.length > 1 ? 's' : ''} outside safe area</span>
          {onSnapLayers ? (
            <button
              className="btn sm"
              style={{
                height: 22,
                padding: '0 8px',
                fontSize: 11,
                background: 'var(--amber)',
                color: '#0b0d12',
                fontWeight: 700,
                border: 0,
                cursor: 'pointer',
              }}
              disabled={snappingAll}
              onClick={handleSnapAll}
            >
              {snappingAll ? 'Fixing…' : 'Auto-Fix All'}
            </button>
          ) : null}
        </div>
      ) : null}

      {items.map(item => {
        const isSelected = selectedPath === item.path;
        const isHovered = hoveredPath === item.path;
        const collision = collisions.get(item.path);

        return (
          <div
            key={item.path}
            className={`canvas-text-hitbox ${isSelected ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: `${item.leftPct}%`,
              top: `${item.topPct}%`,
              width: `${item.widthPct}%`,
              height: `${item.heightPct}%`,
              pointerEvents: 'auto',
              cursor: isSelected ? 'default' : 'pointer',
              border: isSelected
                ? '2px solid var(--accent)'
                : collision
                ? '2px dashed var(--amber)'
                : isHovered
                ? '1.5px dashed var(--accent)'
                : '1px solid transparent',
              borderRadius: 4,
              boxShadow: isSelected
                ? '0 0 12px rgba(70, 147, 241, 0.45)'
                : collision
                ? '0 0 12px rgba(231, 173, 85, 0.35)'
                : 'none',
              background: isSelected
                ? 'rgba(70, 147, 241, 0.08)'
                : collision
                ? 'rgba(231, 173, 85, 0.07)'
                : isHovered
                ? 'rgba(70, 147, 241, 0.04)'
                : 'transparent',
              transition: 'border-color 0.1s ease, background 0.1s ease',
            }}
            onClick={e => {
              e.stopPropagation();
              onSelectPath(item.path);
            }}
            onMouseEnter={() => setHoveredPath(item.path)}
            onMouseLeave={() => setHoveredPath(null)}
            title={collision ? `⚠️ ${collision.hint}` : 'Click to edit on canvas'}
          >
            {/* Corner handles when selected */}
            {isSelected ? (
              <>
                <span className="canvas-corner top-left" style={{ position: 'absolute', top: -4, left: -4, width: 8, height: 8, background: '#fff', border: '1.5px solid var(--accent)', borderRadius: 2 }} />
                <span className="canvas-corner top-right" style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#fff', border: '1.5px solid var(--accent)', borderRadius: 2 }} />
                <span className="canvas-corner bottom-left" style={{ position: 'absolute', bottom: -4, left: -4, width: 8, height: 8, background: '#fff', border: '1.5px solid var(--accent)', borderRadius: 2 }} />
                <span className="canvas-corner bottom-right" style={{ position: 'absolute', bottom: -4, right: -4, width: 8, height: 8, background: '#fff', border: '1.5px solid var(--accent)', borderRadius: 2 }} />
              </>
            ) : null}

            {/* Label tag on hover */}
            {!isSelected && isHovered ? (
              <span
                style={{
                  position: 'absolute',
                  top: -22,
                  left: 0,
                  background: 'var(--surface)',
                  color: collision ? 'var(--amber)' : 'var(--text)',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: `1px solid ${collision ? 'var(--amber)' : 'var(--accent)'}`,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
              >
                {collision ? '⚠️' : '✎'} {item.id}
              </span>
            ) : null}

            {/* Safe zone violation indicator badge */}
            {collision && !isSelected ? (
              <span
                style={{
                  position: 'absolute',
                  bottom: -20,
                  left: 0,
                  background: 'var(--amber)',
                  color: '#0b0d12',
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  zIndex: 2,
                }}
              >
                ⚠️ {collision.name}
              </span>
            ) : null}
          </div>
        );
      })}

      {/* Floating Contextual Micro-Toolbar for Selected Element */}
      {selectedItem ? (
        <div
          className="canvas-floating-toolbar"
          style={{
            position: 'absolute',
            left: `${Math.max(2, Math.min(60, selectedItem.leftPct))}%`,
            top: selectedItem.topPct > 20 ? `${selectedItem.topPct - 13}%` : `${selectedItem.topPct + selectedItem.heightPct + 3}%`,
            pointerEvents: 'auto',
            background: 'var(--surface)',
            border: `1px solid ${selectedCollision ? 'var(--amber)' : 'color-mix(in srgb, var(--accent) 50%, var(--border))'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '6px 10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 30,
            maxWidth: '92%',
            minWidth: 300,
            flexWrap: 'wrap',
          }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: selectedCollision ? 'var(--amber)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
            {selectedCollision ? '⚠️' : '✎'} {selectedItem.id}
          </span>

          <input
            ref={inputRef}
            className="input"
            style={{
              flex: 1,
              height: 30,
              fontSize: 13,
              padding: '2px 8px',
              background: 'var(--surface-2)',
              minWidth: 140,
            }}
            value={editingText}
            placeholder="Edit text directly…"
            onChange={e => setEditingText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSave();
              } else if (e.key === 'Escape') {
                onSelectPath(null);
              }
            }}
          />

          <button
            className="btn primary sm"
            style={{ height: 30, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? <Spinner size={12} /> : <CheckIcon size={12} />}
            <span>Save</span>
          </button>

          {/* 1-Click Snap to Safe Area Button */}
          {selectedCollision && onSnapLayers ? (
            <button
              className="btn sm"
              style={{
                height: 30,
                padding: '0 10px',
                fontSize: 11.5,
                background: 'var(--amber)',
                color: '#0b0d12',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 0,
                cursor: 'pointer',
              }}
              disabled={snapping}
              onClick={() => void handleSnap()}
              title={selectedCollision.hint}
            >
              {snapping ? <Spinner size={12} /> : <ShieldIcon size={12} />}
              <span>Snap to Safe</span>
            </button>
          ) : null}

          <button
            className="btn ghost sm"
            style={{ height: 30, padding: '0 8px', color: 'var(--muted)' }}
            onClick={() => onSelectPath(null)}
            title="Cancel"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
