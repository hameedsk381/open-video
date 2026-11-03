import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from '@ove/react';

// three.js inside a React video. The scene is a pure function of the frame: the same frame draws the same picture on every render.
// preserveDrawingBuffer keeps the WebGL picture readable when the frame is captured.
export const config = { id: 'three-video', name: 'Three.js video', width: 1280, height: 720, fps: 30, durationInFrames: 120, background: '#070b14' };

export default function Scene() {
  const frame = useCurrentFrame(), { width, height, fps } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null), three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; knot: THREE.Mesh } | null>(null);
  useLayoutEffect(() => {
    if (!three.current) {
      const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setSize(width, height, false);
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 7);
      scene.add(new THREE.AmbientLight(0x6688ff, 0.8));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 5, 6); scene.add(key);
      const rim = new THREE.DirectionalLight(0x22d3ee, 2); rim.position.set(-5, -2, -3); scene.add(rim);
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.5, 0.5, 220, 32), new THREE.MeshStandardMaterial({ color: 0x818cf8, metalness: 0.55, roughness: 0.25 }));
      scene.add(knot);
      three.current = { renderer, scene, camera, knot };
    }
    const { renderer, scene, camera, knot } = three.current;
    const grow = spring({ frame, fps, damping: 14, stiffness: 90 });
    knot.rotation.set(frame * 0.021, frame * 0.034, 0); knot.scale.setScalar(grow);
    renderer.render(scene, camera);
  }, [frame, width, height, fps]);
  const title = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width, height }} />
      <div style={{ position: 'absolute', left: 80, bottom: 80, color: '#fff', font: '800 84px Inter', opacity: title, transform: `translateY(${(1 - title) * 30}px)` }}>Real 3D, in a video</div>
    </AbsoluteFill>
  );
}
