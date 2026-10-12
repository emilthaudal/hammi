import { useEffect, useRef } from "react";
import { Frame, H, W } from "../game/frame";
import { paint, PALETTES } from "../game/paint";
import type { Scene } from "../game/scene";

type Props = {
  scene: Scene;
  /** Called with the tap position as fractions of the screen size. */
  onTap?: (fx: number, fy: number) => void;
};

const FRAME_MS = 80;

export function Lcd({ scene, onTap }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const frame = new Frame();
    let scale = 1;
    let gap = 0;
    let raf = 0;
    let last = 0;
    let dark: boolean | null = null;

    // Integer device pixels per LCD pixel keeps every cell crisp.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      scale = Math.max(1, Math.floor(Math.min((wrap.clientWidth * dpr) / W, (wrap.clientHeight * dpr) / H)));
      gap = scale >= 5 ? Math.max(1, Math.round(scale / 9)) : 0;
      canvas.width = W * scale;
      canvas.height = H * scale;
      canvas.style.width = `${(W * scale) / dpr}px`;
      canvas.style.height = `${(H * scale) / dpr}px`;
      last = 0;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      scene.render(frame, t);
      const pal = scene.dark ? PALETTES.dark : PALETTES.light;
      if (dark !== scene.dark) {
        dark = scene.dark;
        wrap.style.background = pal.bg;
      }
      paint(ctx, frame, scale, gap, pal);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [scene]);

  return (
    <div className="lcd" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Hammi's screen"
        onPointerDown={(e) => {
          if (!onTap) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onTap((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
        }}
      />
    </div>
  );
}
