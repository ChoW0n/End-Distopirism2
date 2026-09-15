//난수원. 전투 도메인은 Math.random 을 직접 부르지 않고 이 인터페이스만 쓴다
//테스트에서 같은 씨앗으로 같은 전투를 재현하기 위한 장치다

export interface Rng {
  //0 이상 1 미만의 실수를 돌려준다
  next(): number;
}

//씨앗을 받아 항상 같은 순서의 난수를 내는 생성기 (mulberry32)
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

//실제 플레이에 쓰는 기본 난수원
export const systemRng: Rng = {
  next: () => Math.random(),
};
