import { Component, ElementRef, OnDestroy, afterNextRender, viewChild } from '@angular/core';

interface Star {
  x: number;
  y: number;
  r: number;
  gold: boolean;
  phase: number;
  speed: number;
  drift: number;
}

/** Sparse twinkling stars with two soft nebula glows, drawn on a fixed canvas behind the app. */
@Component({
  selector: 'app-starfield',
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 17% 34%, var(--bg-glow) 0, transparent 22%),
        radial-gradient(circle at 82% 66%, var(--bg-glow) 0, transparent 20%),
        var(--bg);
    }
    canvas { width: 100%; height: 100%; display: block; }
  `,
})
export class Starfield implements OnDestroy {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private stars: Star[] = [];
  private frame = 0;
  private readonly onResize = () => this.resize();

  constructor() {
    afterNextRender(() => {
      this.resize();
      window.addEventListener('resize', this.onResize);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) this.draw(0);
      else this.loop(0);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
  }

  private resize(): void {
    const el = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    el.width = window.innerWidth * dpr;
    el.height = window.innerHeight * dpr;
    el.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deliberately sparse, like the original: roughly one star per 45k px².
    const count = Math.max(8, Math.round((window.innerWidth * window.innerHeight) / 45000));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.6 + 0.9,
      gold: Math.random() < 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.0008 + 0.0004,
      drift: (Math.random() - 0.5) * 0.004,
    }));
  }

  private loop = (t: number) => {
    this.draw(t);
    this.frame = requestAnimationFrame(this.loop);
  };

  private draw(t: number): void {
    const ctx = this.canvas().nativeElement.getContext('2d')!;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const s of this.stars) {
      s.y += s.drift;
      if (s.y < 0) s.y = window.innerHeight;
      if (s.y > window.innerHeight) s.y = 0;
      const alpha = 0.45 + 0.45 * Math.sin(t * s.speed + s.phase);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.gold ? `rgba(193,160,94,${alpha})` : `rgba(170,172,180,${alpha * 0.8})`;
      ctx.fill();
    }
  }
}
