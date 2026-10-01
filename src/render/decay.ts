//휘두르기 잔흔 장 시간 다시 나누기 (SPEC-005 §12.5). 렌더러를 모른다
//합은 그대로 두고, 앞 장은 길게 뒤 장은 짧게 — 처음엔 천천히 사라지다 끝에서 촤라락 지워진다

//base: 납품 장 시간들, k: 곡선 세기 (1 이면 고르게). 장 i 는 T × (i/n)^(1/k) 에 시작한다
export function decayDurations(base: readonly number[], k: number): number[] {
  const n = base.length;
  const total = base.reduce((a, b) => a + b, 0);
  if (n <= 1 || !(k > 0) || k === 1) return [...base];
  const start = (i: number): number => total * Math.pow(i / n, 1 / k);
  return base.map((_, i) => start(i + 1) - start(i));
}
