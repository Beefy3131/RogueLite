import Phaser from 'phaser';
import { AMBIENT } from '../config/balance';
import type { AmbientStyle } from '../config/maps';

interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  baseAlpha: number;
  twinklePhase: number;
  /** Astral: per-mote hue offset for the rainbow cycle. */
  hueOffset: number;
}

interface StyleDef {
  texture: string;
  tints: number[];
  alphaMin: number;
  alphaMax: number;
  scaleMin: number;
  scaleMax: number;
  add: boolean;
  /** Drift bias (world px/s added to the random wander). */
  biasX: number;
  biasY: number;
  /** Rainbow hue cycling (Astral Rift). */
  psychedelic?: boolean;
  depth: number;
}

const STYLES: Record<AmbientStyle, StyleDef> = {
  spores: {
    texture: 'p-circle_05',
    tints: [0x9ccc65, 0xc5e1a5, 0x7cb342],
    alphaMin: 0.14, alphaMax: 0.3,
    scaleMin: 0.06, scaleMax: 0.14,
    add: true, biasX: 0, biasY: -4, depth: 3,
  },
  mist: {
    texture: 'p-smoke_04',
    tints: [0x90a4ae, 0xb0bec5],
    alphaMin: 0.05, alphaMax: 0.12,
    scaleMin: 0.6, scaleMax: 1.1,
    add: false, biasX: 10, biasY: 0, depth: 12,
  },
  embers: {
    texture: 'p-spark_04',
    tints: [0xffab40, 0xff7043, 0xffd54f],
    alphaMin: 0.35, alphaMax: 0.7,
    scaleMin: 0.05, scaleMax: 0.1,
    add: true, biasX: 0, biasY: -18, depth: 3,
  },
  astral: {
    texture: 'p-star_07',
    tints: [0xffffff], // overwritten every frame by the hue cycle
    alphaMin: 0.3, alphaMax: 0.65,
    scaleMin: 0.06, scaleMax: 0.13,
    add: true, biasX: 0, biasY: 0,
    psychedelic: true, depth: 3,
  },
};

/**
 * Per-map ambient mood layer: a small fixed pool of drifting motes that stay
 * inside the camera view by wrapping at its edges (feels infinite, costs
 * ~AMBIENT.count images). Forest spores rise, graveyard mist crawls, inferno
 * embers float up, and the Astral Rift's stars cycle through the spectrum.
 */
export class AmbientDrift {
  private readonly motes: Mote[] = [];
  private readonly style: StyleDef;
  private elapsed = 0;

  constructor(private readonly scene: Phaser.Scene, style: AmbientStyle) {
    this.style = STYLES[style];
    const view = scene.cameras.main.worldView;
    for (let i = 0; i < AMBIENT.count; i++) {
      const s = this.style;
      const img = scene.add
        .image(0, 0, s.texture)
        .setDepth(s.depth)
        .setBlendMode(s.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setScale(s.scaleMin + Math.random() * (s.scaleMax - s.scaleMin))
        .setTint(s.tints[(Math.random() * s.tints.length) | 0]);
      const angle = Math.random() * Math.PI * 2;
      const speed = AMBIENT.minSpeed + Math.random() * (AMBIENT.maxSpeed - AMBIENT.minSpeed);
      const mote: Mote = {
        img,
        vx: Math.cos(angle) * speed + s.biasX,
        vy: Math.sin(angle) * speed + s.biasY,
        baseAlpha: s.alphaMin + Math.random() * (s.alphaMax - s.alphaMin),
        twinklePhase: Math.random() * Math.PI * 2,
        hueOffset: Math.random(),
      };
      // Scatter across the initial view (worldView may be empty on frame 0 —
      // fall back to a region around the camera scroll origin).
      const w = view.width || 1200;
      const h = view.height || 675;
      img.setPosition(view.x + Math.random() * w, view.y + Math.random() * h);
      img.setAlpha(mote.baseAlpha);
      this.motes.push(mote);
    }
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    const dt = deltaMs / 1000;
    const view = this.scene.cameras.main.worldView;
    const margin = 40;
    const left = view.x - margin;
    const right = view.right + margin;
    const top = view.y - margin;
    const bottom = view.bottom + margin;
    const w = right - left;
    const h = bottom - top;

    for (const m of this.motes) {
      m.img.x += m.vx * dt;
      m.img.y += m.vy * dt;
      // Wrap at the view edges so the layer follows the camera for free.
      if (m.img.x < left) m.img.x += w;
      else if (m.img.x > right) m.img.x -= w;
      if (m.img.y < top) m.img.y += h;
      else if (m.img.y > bottom) m.img.y -= h;

      const twinkle = 0.7 + 0.3 * Math.sin(this.elapsed * 0.002 + m.twinklePhase);
      m.img.setAlpha(m.baseAlpha * twinkle);

      if (this.style.psychedelic) {
        const hue = (this.elapsed * 0.00006 + m.hueOffset) % 1;
        m.img.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.65, 1).color);
      }
    }
  }

  destroy(): void {
    for (const m of this.motes) m.img.destroy();
    this.motes.length = 0;
  }
}
