import { useEffect, useRef } from "react";
import { Frame, H, W } from "../game/frame";
import { paint, PALETTES } from "../game/paint";
import type { Scene } from "../game/scene";

type Props = {
  scene: Scene;
  /** Called when the screen is pressed (`down`) or released, at fractions of its size. */
  onTouch?: (fx: number, fy: number, down: boolean) => void;
};

export function Lcd({ scene, onTouch }: Props) {
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
      if (t - last < scene.frameMs) return;
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
          if (!onTouch) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          onTouch((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, true);
        }}
        onPointerUp={() => onTouch?.(0, 0, false)}
        onPointerCancel={() => onTouch?.(0, 0, false)}
      />
    </div>
  );
}
