//물금 VFX 띠 텍스처 읽기 (SPEC-005 §15.2). 실험 화면 두 곳이 같이 쓴다. 브라우저 전용
import type { StripSource } from './ribbon-slash.js';

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
