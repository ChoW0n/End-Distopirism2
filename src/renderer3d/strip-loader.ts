//VFX 그림 읽기와 텍스처 자르기. 브라우저 전용 작업을 메시 계산과 분리한다
import * as THREE from 'three';
import type { SpaceFxTrack } from '../render/space-fx.js';
import type { StripSource } from './ribbon-slash.js';

//공통 캔버스의 crop 칸만 자른다. 축소된 공유본은 실제 그림 배율을 반영한다
export function cropTexture(image: HTMLImageElement, track: SpaceFxTrack, maxSide: number): THREE.Texture {
  const r = image.naturalWidth > 0 ? image.naturalWidth / track.canvas[0] : 1;
  const [x0, y0, x1, y1] = track.crop;
  const w = Math.max(1, (x1 - x0) * r);
  const h = Math.max(1, (y1 - y0) * r);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(image, x0 * r, y0 * r, w, h, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

//띠 텍스처를 읽는다. 그림과 같은 그림의 RGBA 바이트(흩어짐 칸 고르기용). 없으면 null
export async function loadStrip(url: string): Promise<StripSource | null> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { image, pixels: data.data, width: canvas.width, height: canvas.height };
}
