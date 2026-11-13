import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { type Detail } from './api';
import { CheckIcon, ShieldIcon, Spinner } from './ui';

import { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem, type LayerMove, type SafeZoneCollision } from './safeZone';
export { checkSafeZoneCollision, resolveSafeZone, type CanvasTextItem, type LayerMove, type SafeZoneCollision };

export type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

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
          const color = typeof layer.color === 'string' ? layer.color : undefined;
          const motion = typeof layer.motion === 'string' ? layer.motion : undefined;

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
            color,
            motion,
            variableName: varName,
          });
        }
      }
    };

    walkLayers(scene.layers, `scenes[${sIdx}].layers`, 0, 0);
  }

  return items;
}

const HANDLE_CURSORS: Record<HandleDirection, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

const HANDLE_POSITIONS: Record<HandleDirection, { top: string; left: string }> = {
  nw: { top: '0%', left: '0%' },
  n: { top: '0%', left: '50%' },
  ne: { top: '0%', left: '100%' },
  e: { top: '50%', left: '100%' },
  se: { top: '100%', left: '100%' },
  s: { top: '100%', left: '50%' },
  sw: { top: '100%', left: '0%' },
  w: { top: '50%', left: '0%' },
};

const DEFAULT_SWATCHES = ['#ffffff', '#000000', '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444'];
const MOTION_PRESETS = ['rise', 'blur', 'slide', 'pop', 'fade'] as const;

export function CanvasDirectOverlay({
  detail,
  currentFrame,
  selectedPath,
  onSelectPath,
  onSaveText,
  onUpdateLayer,
  onSnapLayers,
  disabled = false,
}: {
  detail: Detail;
  currentFrame: number;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  onSaveText: (path: string, content: string, variableName?: string) => Promise<void>;
  onUpdateLayer?: (path: string, patch: Record<string, any>) => Promise<void>;
  onSnapLayers?: (moves: LayerMove[]) => Promise<void>;
  disabled?: boolean;
}) {
  const compWidth = Number(detail.width) || 1080;
  const compHeight = Number(detail.height) || 1920;
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Drag and Transform state
  const [activeDrag, setActiveDrag] = useState<{
    item: CanvasTextItem;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const [activeResize, setActiveResize] = useState<{
    item: CanvasTextItem;
    handle: HandleDirection;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    initialFontSize: number;
  } | null>(null);

  const [liveOffset, setLiveOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [liveResize, setLiveResize] = useState<{ width: number; height: number; dx: number; dy: number; fontSize?: number } | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x?: number; y?: number } | null>(null);

  const selectedItem = useMemo(() => items.find(i => i.path === selectedPath) ?? null, [items, selectedPath]);
  const selectedCollision = selectedItem ? collisions.get(selectedItem.path) : null;

  useEffect(() => {
    if (selectedItem) {
      setEditingText(selectedItem.content);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selectedItem]);

  // Handle Drag Move & Resize via Global Mouse Listeners
  const handleMouseDownItem = (e: React.MouseEvent, item: CanvasTextItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectPath(item.path);

    setActiveDrag({
      item,
      startX: e.clientX,
      startY: e.clientY,
      initialX: item.x,
      initialY: item.y,
    });
    setLiveOffset({ dx: 0, dy: 0 });
    setSnapGuide(null);
  };

  const handleMouseDownHandle = (e: React.MouseEvent, item: CanvasTextItem, handle: HandleDirection) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    setActiveResize({
      item,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialX: item.x,
      initialY: item.y,
      initialWidth: item.width,
      initialHeight: item.height,
      initialFontSize: item.fontSize,
    });
    setLiveResize(null);
    setSnapGuide(null);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scaleX = compWidth / rect.width;
      const scaleY = compHeight / rect.height;

      if (activeDrag) {
        let deltaX = (e.clientX - activeDrag.startX) * scaleX;
        let deltaY = (e.clientY - activeDrag.startY) * scaleY;

        const targetX = activeDrag.initialX + deltaX;
        const targetY = activeDrag.initialY + deltaY;

        // Snapping: canvas center X
        const centerX = compWidth / 2;
        const itemCenterX = targetX + activeDrag.item.width / 2;
        let guide: { x?: number; y?: number } = {};

        if (Math.abs(itemCenterX - centerX) < 18) {
          deltaX = centerX - activeDrag.item.width / 2 - activeDrag.initialX;
          guide.x = 50; // 50%
        }

        // Snapping: canvas center Y
        const centerY = compHeight / 2;
        const itemCenterY = targetY + activeDrag.item.height / 2;
        if (Math.abs(itemCenterY - centerY) < 18) {
          deltaY = centerY - activeDrag.item.height / 2 - activeDrag.initialY;
          guide.y = 50;
        }

        setSnapGuide(guide.x !== undefined || guide.y !== undefined ? guide : null);
        setLiveOffset({ dx: Math.round(deltaX), dy: Math.round(deltaY) });
      } else if (activeResize) {
        const deltaX = (e.clientX - activeResize.startX) * scaleX;
        const deltaY = (e.clientY - activeResize.startY) * scaleY;
        const { handle, initialWidth, initialHeight, initialFontSize } = activeResize;

        let newWidth = initialWidth;
        let newHeight = initialHeight;
        let dx = 0;
        let dy = 0;

        if (handle.includes('e')) {
          newWidth = Math.max(60, initialWidth + deltaX);
        } else if (handle.includes('w')) {
          newWidth = Math.max(60, initialWidth - deltaX);
          dx = initialWidth - newWidth;
        }

        if (handle.includes('s')) {
          newHeight = Math.max(30, initialHeight + deltaY);
        } else if (handle.includes('n')) {
          newHeight = Math.max(30, initialHeight - deltaY);
          dy = initialHeight - newHeight;
        }

        // If corner resize, proportionally adjust font size
        let newFontSize: number | undefined;
        if (['nw', 'ne', 'se', 'sw'].includes(handle)) {
          const ratio = Math.max(0.3, newWidth / initialWidth);
          newFontSize = Math.round(Math.max(12, Math.min(240, initialFontSize * ratio)));
        }

        setLiveResize({
          width: Math.round(newWidth),
          height: Math.round(newHeight),
          dx: Math.round(dx),
          dy: Math.round(dy),
          fontSize: newFontSize,
        });
      }
    },
    [activeDrag, activeResize, compWidth, compHeight]
  );

  const handleMouseUp = useCallback(async () => {
    if (activeDrag && liveOffset && (liveOffset.dx !== 0 || liveOffset.dy !== 0)) {
      if (onSnapLayers) {
        await onSnapLayers([{ path: activeDrag.item.path, dx: liveOffset.dx, dy: liveOffset.dy }]);
      } else if (onUpdateLayer) {
        await onUpdateLayer(activeDrag.item.path, {
          x: Math.round(activeDrag.initialX + liveOffset.dx),
          y: Math.round(activeDrag.initialY + liveOffset.dy),
        });
      }
    } else if (activeResize && liveResize) {
      if (onUpdateLayer) {
        const patch: Record<string, any> = {
          maxWidth: liveResize.width,
        };
        if (liveResize.dx !== 0) patch.x = Math.round(activeResize.initialX + liveResize.dx);
        if (liveResize.dy !== 0) patch.y = Math.round(activeResize.initialY + liveResize.dy);
        if (liveResize.fontSize) patch.fontSize = liveResize.fontSize;
        await onUpdateLayer(activeResize.item.path, patch);
      }
    }

    setActiveDrag(null);
    setActiveResize(null);
    setLiveOffset(null);
    setLiveResize(null);
    setSnapGuide(null);
  }, [activeDrag, liveOffset, activeResize, liveResize, onSnapLayers, onUpdateLayer]);

  useEffect(() => {
    if (activeDrag || activeResize) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [activeDrag, activeResize, handleMouseMove, handleMouseUp]);

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
    const moves = itemsWithViolations.flatMap(item => {
      const move = resolveSafeZone(item, compWidth, compHeight);
      return move ? [{ path: item.path, ...move }] : [];
    });
    if (!moves.length) return;
    setSnappingAll(true);
    try {
      await onSnapLayers(moves);
    } finally {
      setSnappingAll(false);
    }
  };

  const handleQuickPatch = async (patch: Record<string, any>) => {
    if (!selectedItem || !onUpdateLayer) return;
    try {
      await onUpdateLayer(selectedItem.path, patch);
    } catch {
      // Ignored
    }
  };

  return (
    <div
      ref={containerRef}
      className="canvas-direct-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: activeDrag || activeResize ? 'auto' : 'none',
        zIndex: 10,
        userSelect: activeDrag || activeResize ? 'none' : 'auto',
      }}
      onClick={() => onSelectPath(null)}
    >
      {/* Magnetic Snapping Guidelines */}
      {snapGuide?.x !== undefined ? (
        <div
          style={{
            position: 'absolute',
            left: `${snapGuide.x}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            zIndex: 22,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {snapGuide?.y !== undefined ? (
        <div
          style={{
            position: 'absolute',
            top: `${snapGuide.y}%`,
            left: 0,
            right: 0,
            height: 1,
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            zIndex: 22,
            pointerEvents: 'none',
          }}
        />
      ) : null}

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
          onClick={e => e.stopPropagation()}
        >
          <ShieldIcon size={13} />
          <span>
            {itemsWithViolations.length} element{itemsWithViolations.length > 1 ? 's' : ''} outside safe area
          </span>
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

        // Apply live drag/resize calculation if this item is currently manipulated
        let renderLeftPct = item.leftPct;
        let renderTopPct = item.topPct;
        let renderWidthPct = item.widthPct;
        let renderHeightPct = item.heightPct;

        if (isSelected && activeDrag && liveOffset) {
          const curX = item.x + liveOffset.dx;
          const curY = item.y + liveOffset.dy;
          renderLeftPct = (curX / compWidth) * 100;
          renderTopPct = (curY / compHeight) * 100;
        } else if (isSelected && activeResize && liveResize) {
          const curX = item.x + liveResize.dx;
          const curY = item.y + liveResize.dy;
          renderLeftPct = (curX / compWidth) * 100;
          renderTopPct = (curY / compHeight) * 100;
          renderWidthPct = (liveResize.width / compWidth) * 100;
          renderHeightPct = (liveResize.height / compHeight) * 100;
        }

        return (
          <div
            key={item.path}
            className={`canvas-text-hitbox ${isSelected ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: `${renderLeftPct}%`,
              top: `${renderTopPct}%`,
              width: `${renderWidthPct}%`,
              height: `${renderHeightPct}%`,
              pointerEvents: 'auto',
              cursor: isSelected ? 'move' : 'pointer',
              border: isSelected
                ? '2px solid var(--accent)'
                : collision
                ? '2px dashed var(--amber)'
                : isHovered
                ? '1.5px dashed var(--accent)'
                : '1px solid transparent',
              borderRadius: 4,
              boxShadow: isSelected
                ? '0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)'
                : collision
                ? '0 0 12px rgba(231, 173, 85, 0.35)'
                : 'none',
              background: isSelected
                ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                : collision
                ? 'rgba(231, 173, 85, 0.07)'
                : isHovered
                ? 'color-mix(in srgb, var(--accent) 4%, transparent)'
                : 'transparent',
              transition: activeDrag || activeResize ? 'none' : 'border-color 0.1s ease, background 0.1s ease',
            }}
            onClick={e => {
              e.stopPropagation();
              onSelectPath(item.path);
            }}
            onMouseDown={e => handleMouseDownItem(e, item)}
            onMouseEnter={() => setHoveredPath(item.path)}
            onMouseLeave={() => setHoveredPath(null)}
            title={collision ? `⚠️ ${collision.hint}` : 'Click & drag to reposition; handles to resize'}
          >
            {/* 8-Point Transform Bounding Box Handles when Selected */}
            {isSelected ? (
              <>
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleDirection[]).map(h => {
                  const pos = HANDLE_POSITIONS[h];
                  const cursor = HANDLE_CURSORS[h];
                  return (
                    <span
                      key={h}
                      className={`canvas-handle handle-${h}`}
                      style={{
                        position: 'absolute',
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -50%)',
                        width: 9,
                        height: 9,
                        background: '#ffffff',
                        border: '1.5px solid var(--accent)',
                        borderRadius: 2,
                        cursor,
                        zIndex: 3,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                        pointerEvents: 'auto',
                      }}
                      onMouseDown={e => handleMouseDownHandle(e, item, h)}
                    />
                  );
                })}
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

      {/* Floating Contextual Property Inspector for Selected Element */}
      {selectedItem ? (
        <div
          className="canvas-floating-toolbar"
          style={{
            position: 'absolute',
            left: `${Math.max(2, Math.min(50, selectedItem.leftPct))}%`,
            top: selectedItem.topPct > 25 ? `${selectedItem.topPct - 17}%` : `${selectedItem.topPct + selectedItem.heightPct + 3}%`,
            pointerEvents: 'auto',
            background: 'var(--surface)',
            border: `1px solid ${selectedCollision ? 'var(--amber)' : 'color-mix(in srgb, var(--accent) 50%, var(--border))'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 35,
            maxWidth: '94%',
            minWidth: 380,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Row 1: Header + Text Input + Save + Snap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: selectedCollision ? 'var(--amber)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
              {selectedCollision ? '⚠️' : '✎'} {selectedItem.id}
            </span>

            <input
              ref={inputRef}
              className="input"
              style={{
                flex: 1,
                height: 28,
                fontSize: 12.5,
                padding: '2px 8px',
                background: 'var(--surface-2)',
                minWidth: 120,
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
              style={{ height: 28, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Spinner size={12} /> : <CheckIcon size={12} />}
              <span>Save</span>
            </button>

            {selectedCollision && onSnapLayers ? (
              <button
                className="btn sm"
                style={{
                  height: 28,
                  padding: '0 8px',
                  fontSize: 11,
                  background: 'var(--amber)',
                  color: '#0b0d12',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  border: 0,
                  cursor: 'pointer',
                }}
                disabled={snapping}
                onClick={() => void handleSnap()}
                title={selectedCollision.hint}
              >
                {snapping ? <Spinner size={11} /> : <ShieldIcon size={11} />}
                <span>Snap</span>
              </button>
            ) : null}

            <button
              className="btn ghost sm"
              style={{ height: 28, padding: '0 6px', color: 'var(--muted)' }}
              onClick={() => onSelectPath(null)}
              title="Close toolbar"
            >
              ✕
            </button>
          </div>

          {/* Row 2: Visual Styling & Animation Presets */}
          {onUpdateLayer ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderTop: '1px solid var(--border)',
                paddingTop: 6,
                fontSize: 11,
                color: 'var(--muted)',
                flexWrap: 'wrap',
              }}
            >
              {/* Font Size Quick Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Size:</span>
                <input
                  type="range"
                  min={16}
                  max={160}
                  value={selectedItem.fontSize}
                  onChange={e => void handleQuickPatch({ fontSize: Number(e.target.value) })}
                  style={{ width: 65, height: 4, cursor: 'pointer' }}
                  title={`Font size: ${selectedItem.fontSize}px`}
                />
                <span style={{ minWidth: 26, fontSize: 11, color: 'var(--text)' }}>{selectedItem.fontSize}</span>
              </div>

              {/* Font Weight Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>Weight:</span>
                {[400, 600, 800].map(w => (
                  <button
                    key={w}
                    className={`btn sm ${selectedItem.fontWeight === w ? 'primary' : 'ghost'}`}
                    style={{
                      height: 22,
                      padding: '0 6px',
                      fontSize: 10,
                      fontWeight: w,
                      border: '1px solid var(--border)',
                    }}
                    onClick={() => void handleQuickPatch({ fontWeight: w })}
                  >
                    {w === 400 ? 'Reg' : w === 600 ? 'Med' : 'Bold'}
                  </button>
                ))}
              </div>

              {/* Color Swatch Palette */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>Color:</span>
                {DEFAULT_SWATCHES.slice(0, 6).map(color => (
                  <button
                    key={color}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: color,
                      border: selectedItem.color === color ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={() => void handleQuickPatch({ color })}
                    title={`Color ${color}`}
                  />
                ))}
              </div>

              {/* Entrance Motion Animation Preset */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>Entrance:</span>
                <select
                  className="input"
                  style={{ height: 22, fontSize: 10.5, padding: '0 4px', background: 'var(--surface-2)' }}
                  value={selectedItem.motion || 'rise'}
                  onChange={e => void handleQuickPatch({ motion: e.target.value })}
                >
                  {MOTION_PRESETS.map(m => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
