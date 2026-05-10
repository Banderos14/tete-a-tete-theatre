type SpotType = 'red' | 'white';

interface Spot {
  fi: number;
  type: SpotType;
  phase: number;
  speed: number;
  rx: number;
  ry: number;
  bright: number;
  cone: number;
  cx: number;
  cy: number;
  flicker: number;
}

interface DustParticle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  sp: number;
}

export class StageLight {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private raf: number | null = null;
  private W = 0;
  private H = 0;

  // Fixture X positions as fractions of width (matches the 7 lamps on the rig bar)
  private readonly FX = [0.13, 0.25, 0.38, 0.50, 0.62, 0.75, 0.87];

  private spots: Spot[] = [
    { fi: 0, type: 'red',   phase: 0.00, speed: 0.00018, rx: 0.20, ry: 0.06, bright: 0.9,  cone: 0.16, cx: 0, cy: 0, flicker: 1 },
    { fi: 2, type: 'red',   phase: 2.10, speed: 0.00015, rx: 0.18, ry: 0.05, bright: 0.85, cone: 0.15, cx: 0, cy: 0, flicker: 1 },
    { fi: 4, type: 'red',   phase: 4.30, speed: 0.00020, rx: 0.19, ry: 0.06, bright: 0.88, cone: 0.16, cx: 0, cy: 0, flicker: 1 },
    { fi: 6, type: 'red',   phase: 1.40, speed: 0.00013, rx: 0.17, ry: 0.05, bright: 0.80, cone: 0.14, cx: 0, cy: 0, flicker: 1 },
    { fi: 1, type: 'white', phase: 0.70, speed: 0.00016, rx: 0.23, ry: 0.06, bright: 0.70, cone: 0.18, cx: 0, cy: 0, flicker: 1 },
    { fi: 3, type: 'white', phase: 3.30, speed: 0.00012, rx: 0.25, ry: 0.06, bright: 0.65, cone: 0.19, cx: 0, cy: 0, flicker: 1 },
    { fi: 5, type: 'white', phase: 1.90, speed: 0.00017, rx: 0.21, ry: 0.05, bright: 0.68, cone: 0.17, cx: 0, cy: 0, flicker: 1 },
  ];

  private dust: DustParticle[] = Array.from({ length: 130 }, () => ({
    x: Math.random() * 700,
    y: Math.random() * 560,
    r: 0.3 + Math.random() * 1.0,
    vx: (Math.random() - 0.5) * 0.14,
    vy: -0.04 - Math.random() * 0.18,
    phase: Math.random() * Math.PI * 2,
    sp: 0.006 + Math.random() * 0.016,
  }));

  constructor(canvasId: string, containerId: string) {
    this.canvas    = document.getElementById(canvasId) as HTMLCanvasElement;
    this.container = document.getElementById(containerId) as HTMLElement;
    this.ctx       = this.canvas.getContext('2d')!;
    this._resize   = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
  }

  start(): void {
    this._resize();
    this.spots.forEach(s => {
      s.cx = this.FX[s.fi] * this.W;
      s.cy = this.H * 0.82;
    });
    const loop = (t: number) => {
      this._frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize);
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private _resize(): void {
    this.W = this.canvas.width  = this.container.offsetWidth;
    this.H = this.canvas.height = this.container.offsetHeight;
  }

  private _frame(t: number): void {
    const { ctx, W, H, FX, spots } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#010101';
    ctx.fillRect(0, 0, W, H);

    const floorY = H * 0.82;

    spots.forEach(s => {
      const baseX = (FX[s.fi] * 0.38 + 0.31) * W;
      const tx = baseX + Math.sin(t * s.speed + s.phase) * s.rx * W;
      const ty = floorY + Math.sin(t * s.speed * 0.68 + s.phase * 1.4) * s.ry * H;
      s.cx += (tx - s.cx) * 0.007;
      s.cy += (ty - s.cy) * 0.007;
      s.flicker += (0.9 + Math.random() * 0.12 - s.flicker) * 0.03;
    });

    // 1. Floor light pools
    spots.forEach(s => this._drawPool(s.cx, s.type, s.bright, s.flicker));

    // 2. Volumetric beams — 'screen' blend makes overlapping lights add together
    ctx.globalCompositeOperation = 'screen';
    spots.forEach(s =>
      this._drawBeam(FX[s.fi] * W, 2, s.cx, s.cy, s.type, s.bright, s.cone, s.flicker)
    );

    // 3. Source glow at each fixture on the rig
    spots.forEach(s => this._drawSourceGlow(FX[s.fi] * W, s.type, s.bright, s.flicker));

    // 4. Dust particles
    ctx.globalCompositeOperation = 'source-over';
    this._drawDust(t);
  }

  /**
   * Volumetric beam via ray-marching (~130 steps).
   * Each step draws a soft radial-gradient disk perpendicular to the beam axis.
   */
  private _drawBeam(
    sx: number, sy: number, tx: number, ty: number,
    type: SpotType, bright: number, coneHalf: number, flicker: number,
  ): void {
    const ctx = this.ctx;
    const dx = tx - sx, dy = ty - sy;
    const beamLen = Math.hypot(dx, dy);
    if (beamLen < 1) return;

    const [cr, cg, cb] = type === 'red' ? [215, 0, 0] : [255, 245, 210];

    const STEPS = 130;
    for (let i = 0; i < STEPS; i++) {
      const tmid = (i + 0.5) / STEPS;
      const wx   = sx + dx * tmid;
      const wy   = sy + dy * tmid;
      const diskR = beamLen * tmid * Math.tan(coneHalf);

      const invSq    = 1 / (1 + tmid * tmid * 4.5);
      const scatter  = Math.pow(Math.sin(tmid * Math.PI * 0.9), 0.55);
      const floorFade = Math.pow(1 - tmid * 0.5, 1.2);
      const alpha    = invSq * scatter * floorFade * bright * flicker * 0.042;
      if (alpha < 0.001) continue;

      const grd = ctx.createRadialGradient(wx, wy, 0, wx, wy, diskR);
      grd.addColorStop(0,    `rgba(${cr},${cg},${cb},${Math.min(alpha, 0.98)})`);
      grd.addColorStop(0.30, `rgba(${cr},${cg},${cb},${alpha * 0.6})`);
      grd.addColorStop(0.65, `rgba(${cr},${cg},${cb},${alpha * 0.18})`);
      grd.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
      ctx.beginPath();
      ctx.arc(wx, wy, diskR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Hot core — narrow bright spine along the beam centre
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    const coreW = Math.max(beamLen * Math.tan(coneHalf) * 0.10, 2.5);
    const px = Math.cos(angle) * coreW, py = Math.sin(angle) * coreW;

    const coreGrd = ctx.createLinearGradient(sx, sy, tx, ty);
    coreGrd.addColorStop(0,    `rgba(${cr},${cg},${cb},${bright * flicker * 0.22})`);
    coreGrd.addColorStop(0.10, `rgba(${cr},${cg},${cb},${bright * flicker * 0.14})`);
    coreGrd.addColorStop(0.45, `rgba(${cr},${cg},${cb},${bright * flicker * 0.07})`);
    coreGrd.addColorStop(0.80, `rgba(${cr},${cg},${cb},${bright * flicker * 0.02})`);
    coreGrd.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
    ctx.beginPath();
    ctx.moveTo(sx + px, sy + py); ctx.lineTo(sx - px, sy - py);
    ctx.lineTo(tx - px * 3, ty - py * 3); ctx.lineTo(tx + px * 3, ty + py * 3);
    ctx.closePath();
    ctx.fillStyle = coreGrd;
    ctx.fill();
  }

  /** Floor pool: three nested soft ellipses (hot centre → penumbra) */
  private _drawPool(tx: number, type: SpotType, bright: number, flicker: number): void {
    const ctx = this.ctx;
    const [cr, cg, cb] = type === 'red' ? [200, 0, 0] : [255, 245, 205];
    const fy = this.H - 62;
    const pr = 52 + bright * 32;

    ([
      [0.7, bright * 0.30],
      [1.4, bright * 0.12],
      [2.4, bright * 0.04],
    ] as [number, number][]).forEach(([sc, a]) => {
      const grd = ctx.createRadialGradient(tx, fy, 0, tx, fy, pr * sc);
      grd.addColorStop(0,   `rgba(${cr},${cg},${cb},${a * flicker})`);
      grd.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a * flicker * 0.35})`);
      grd.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
      ctx.save();
      ctx.scale(1, 0.20);
      ctx.beginPath();
      ctx.arc(tx, fy / 0.20, pr * sc, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.restore();
    });
  }

  /** Glow at the fixture head on the rig bar */
  private _drawSourceGlow(sx: number, type: SpotType, bright: number, flicker: number): void {
    const ctx = this.ctx;
    const [cr, cg, cb] = type === 'red' ? [255, 55, 55] : [255, 250, 215];
    ([
      [7,  bright * flicker * 0.75],
      [20, bright * flicker * 0.28],
      [42, bright * flicker * 0.08],
    ] as [number, number][]).forEach(([r, a]) => {
      const grd = ctx.createRadialGradient(sx, 2, 0, sx, 2, r);
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.beginPath();
      ctx.arc(sx, 2, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  /** Floating dust particles, lit only inside a beam cone */
  private _drawDust(t: number): void {
    const { ctx, W, H, FX, spots, dust } = this;
    for (const d of dust) {
      d.x += d.vx; d.y += d.vy;
      if (d.y < -4)   { d.y = H + 4; d.x = Math.random() * W; }
      if (d.x < -4)    d.x = W + 4;
      if (d.x > W + 4) d.x = -4;

      let bestA = 0, br = 255, bg = 248, bb = 218;
      for (const s of spots) {
        const sx = FX[s.fi] * W;
        const blen = Math.hypot(s.cx - sx, s.cy - 2);
        const axX = (s.cx - sx) / blen, axY = (s.cy - 2) / blen;
        const proj = (d.x - sx) * axX + (d.y - 2) * axY;
        if (proj < 0 || proj > blen * 1.05) continue;
        const perpX = (d.x - sx) - proj * axX, perpY = (d.y - 2) - proj * axY;
        const perpD = Math.hypot(perpX, perpY);
        const coneR = proj * Math.tan(s.cone);
        if (perpD > coneR) continue;
        const edge  = 1 - (perpD / coneR);
        const depth = Math.pow(1 - (proj / blen) * 0.5, 1.3);
        const a = edge * depth * s.bright * s.flicker * 0.88;
        if (a > bestA) {
          bestA = a;
          if (s.type === 'red') { br = 255; bg = 65; bb = 65; }
          else                  { br = 255; bg = 248; bb = 218; }
        }
      }
      if (bestA < 0.04) continue;
      const flk = 0.5 + 0.5 * Math.sin(d.phase + t * d.sp);
      ctx.save();
      ctx.globalAlpha = Math.min(bestA * flk * 0.82, 0.9);
      ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
