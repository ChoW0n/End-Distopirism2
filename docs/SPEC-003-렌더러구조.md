# SPEC-003 · 렌더러 구조 (v1.0)

상태: **확정 v1.0** / 작성 2026-09-21 / 성격: **역문서화**

> 이 문서는 새로 설계한 것이 아니라 **이미 들어와 돌아가는 `src/render/`·`src/camera/` 구조를
> 적은 것**이다. 코드가 먼저 들어왔고 문서가 뒤따랐다. 이후로는 순서를 되돌려
> **이 문서를 고치고 코드를 고친다** (CLAUDE.md 의 SDD 규칙).
>
> 전투 규칙은 `SPEC-001-전투시스템.md` + `SPEC-001-v2.0-개정.md`, 좌표 데이터 규격은
> `SPEC-002-에셋파이프라인.md` 가 기준이다. 여기서는 **그 둘을 잇는 계층**만 다룬다.

---

## 1. 무엇을 정하는 문서인가

CLAUDE.md 의 계층 규칙을 코드 단위까지 내린 것이다.

```
도메인 (src/domain)         순수 로직. 입력 → 상태 + BattleEvent[]
   ↓ 이벤트만
어댑터 (src/render, src/camera)   이벤트 → 렌더 명령 / 카메라 명령
   ↓ 명령만
렌더러 (미구현)             three.js·canvas. 명령을 받아 실제로 그린다
```

**어댑터는 그리지 않는다.** "무엇을 어디에 어느 각도로" 까지만 내고 끝낸다.
그래서 `src/render/` 와 `src/camera/` 전체에 DOM·three.js·브라우저 API import 가 하나도 없다.
유니티로 되돌릴 때 갈아끼우는 곳은 렌더러 한 층뿐이다.

---

## 2. 파일 4분할

| 파일 | 줄 | 책임 | 의존 |
|---|---|---|---|
| `render/manifest.ts` | 352 | 매니페스트·바인딩 파싱과 검증, id 조회표 | 없음 |
| `render/stage.ts` | 160 | 앵커를 무대 좌표로 푸는 계산 | manifest |
| `render/cutscene.ts` | 202 | 궁극기 컷신 13레이어 변환 | manifest |
| `render/presenter.ts` | 354 | 이벤트 → 렌더 명령 | 위 셋 + domain |
| `camera/director.ts` | 121 | 이벤트 → 카메라 명령 | domain |

**나누는 기준은 "무엇을 들고 있는가"다.** 원본 `BattleManager`(1,232줄)가 상태·연출·UI·입력을
전부 들고 있었던 게 재설계가 실패한 이유라, 상태를 가진 클래스를 하나씩 떼어 놓았다.

- `SpriteCatalog` — 조회표만. 상태 없음
- `Stage` — 캐릭터별 조회표 묶음만. 상태 없음
- `CutsceneDirector` — 레이어 구조만. 상태 없음
- `BattlePresenter` — **진행 중인 교전 하나**와 **궁극기 대기 목록**을 들고 있다
- `CameraDirector` — **지금 보고 있는 것** 하나를 들고 있다

상태를 가진 건 뒤의 둘뿐이고, 각각 필드 하나로만 들고 있다. 두 군데서 같은 상태를 들지 않는다.
(원본 카메라 버그가 커서추종 Lerp 와 DOTween 복귀 트윈이 각자 `transform` 을 덮어써서 난 것이다.)

---

## 3. 파일 시스템은 platform 이 맡는다

`src/render/` 는 파일을 읽지 않는다. 읽는 건 `src/platform/node-manifest.ts` 다.

```ts
loadCharacterAssets(assetsRoot, characterId): SpriteCatalog | null
loadStageCatalogs(assetsRoot, characterIds): Map<string, SpriteCatalog>
```

- `assets/<캐릭터>/sprite-manifest.json` 이 없으면 **`null`** 이다. 예외를 던지지 않는다
- 브라우저에서는 이 파일 대신 fetch 로 읽는 같은 모양의 어댑터를 만들면 된다
- 도메인 쪽의 `node-data.ts` 와 같은 자리다

---

## 4. 무대 좌표 (`stage.ts`)

### 4.1 배치는 앵커로만 한다

```ts
interface StagePlacement {
  combatantId: string;   //전투 안의 식별자 (a1, e2 …)
  characterId: string;   //어느 스프라이트를 쓰는가 (incinerator …)
  position: Point;       //발이 닿는 지점
  facing: 1 | -1;
}
```

`combatantId` 와 `characterId` 는 **다르다.** 미러전이면 양쪽이 같은 `characterId` 를 쓴다.
초기 구현이 이 둘을 섞어 써서 `StageError: 스프라이트 매니페스트가 없다: e1` 로 터졌었다.

**이미지 크기로 배치하지 않는다** (SPEC-002 §3.1). 프레임마다 캐릭터 크기가 달라서
이미지 기준으로 놓으면 공격할 때마다 캐릭터가 움직인다.

### 4.2 앵커 4종이 좌표로 풀리는 자리

`resolveAnchor()` 하나가 SPEC-002 §5.1 표를 그대로 구현한다.

| 앵커 | 계산 |
|---|---|
| `bladeTip` | 프레임의 날끝을 무대 좌표로 옮긴 값 |
| `groundPoint` | 날끝 x + 시전자의 접지선 y |
| `hitPoint` | **맞은 쪽**의 접지점과 머리 중심의 중간 |
| `emissionPoint` | 호출한 쪽이 넘긴 월드 좌표를 그대로 |

`hitPoint` 는 대상이 없으면, `emissionPoint` 는 발생 좌표가 없으면 `StageError` 를 던진다.
조용히 (0,0) 으로 떨어지지 않는다.

---

## 5. 렌더 명령 (`presenter.ts`)

```ts
type RenderCommand =
  | { type: 'playFrames'; combatantId; frameIds: string[] }
  | { type: 'spawnEffect'; sourceId; targetId; frameId; placement: EffectPlacement }
  | { type: 'ultimate'; combatantId; phase: UltimatePhase; layers: LayerTransform[] | null }
  | { type: 'placeholder'; combatantId; characterId }
```

### 5.1 `spawnEffect` 의 `frameId` 가 타이밍을 정한다

| `frameId` | 뜻 | 쓰이는 곳 |
|---|---|---|
| 프레임 id | 그 프레임이 재생될 때 터뜨린다 | 무기 궤적 (`bladeTip`) |
| `null` | 지금 바로 터뜨린다 | 섬광·지면 충격·화염·잔류 |

**§5.4 와 §6-1 이 부딪히는 지점이라 앵커로 갈랐다.** §5.4 는 `ground-impact` 를
`11-skill3-finish` 프레임에 묶으라 하고, §6-1 은 피해 없이는 지면 충격을 내지 말라 한다.
무기 궤적은 휘두르는 동작 자체라 빗나가도 보여야 하고, 충격·섬광은 맞아야 나온다.
그래서 `bladeTip` 만 프레임과 같이 나가고 나머지는 `damageApplied > 0` 뒤로 미룬다.

### 5.2 교전 한 건의 상태

```ts
interface EngagementSide {
  combatantId: string;
  frameId: string | null;   //이펙트를 붙일 기준 프레임. 에셋 없으면 null
  effectIds: string[];      //전용기면 프레임 바인딩, 궁극기면 궁극기 바인딩
}
```

전용기와 궁극기의 갈림이 `beginSide()` 한 곳에만 있다. 피해 처리(`onDamage`)는 어느 쪽인지
모른 채 `effectIds` 만 읽는다.

### 5.3 궁극기 4단계

| phase | 언제 | 출처 |
|---|---|---|
| `ready` | 턴 종료 판정에서 조건 충족 | 도메인 `ultimateReady` |
| `cardAdded` | 다음 턴 시작, 덱에 카드가 들어옴 | **프리젠터가 유도** |
| `cutscene` | 궁극기 카드를 실제로 사용 | 스킬 슬롯이 `ULT` |
| `used` | 속성 초기화 + 덱에서 제거 | 도메인 `ultimateUsed` |

**`cardAdded` 는 도메인 이벤트가 아니다.** 도메인은 턴 시작에 카드를 덱에 넣기만 하고
알리지 않는다. SPEC-001 v2.0 §4 가 "이벤트는 셋만 추가한다"라고 못 박았으므로 네 번째를
만들지 않고, 프리젠터가 직전 턴의 `ready` 를 들고 있다가 다음 `turnStart` 에서 낸다.

`used` 가 `cutscene` 보다 **먼저** 나온다. 도메인이 카드를 소모한 뒤 합을 굴리기 때문이고,
프리젠터가 이 순서를 뒤집지 않는다. 이벤트 순서의 출처는 도메인 하나다.

### 5.4 컷신

`cutscene` 단계의 `layers` 에 `CutsceneDirector.layers()` 결과가 실린다.
컷신 데이터가 없는 캐릭터는 `null` 이고, 명령 자체는 그대로 나간다.

`LayerTransform` 은 `(pivot, offset, rotationDeg)` 다. 렌더러는
**`translate(pivot) → rotate(rotationDeg) → drawImage(offset)`** 순으로 그린다.
자기 회전은 자기 피벗을 옮기지 않고, 조상의 회전만 옮긴다.

눈·입은 그룹당 하나만 켜진다(13장 → 10장). 회전은 매니페스트의 `motionDeg` 로 잘린다.

### 5.5 에셋이 없는 캐릭터

`stage.has(characterId)` 가 false 면 `placeholder` 명령만 나간다.
**다른 캐릭터 에셋을 대신 물리지 않는다** (SPEC-002 §10).
에셋 있는 캐릭터와 없는 캐릭터가 한 전투에 섞여도 터지지 않는다.

---

## 6. 카메라 명령 (`camera/director.ts`)

```ts
type CameraCommand =
  | { type: 'idle' }
  | { type: 'focus'; subjectIds: [string, string]; zoom: number }
  | { type: 'shake'; intensity: number }
```

- 교전 시작 → `focus` (양쪽 id 와 배율). 교전 종료 → `idle`
- **한 턴에 교전이 여러 건이면 사이에 `idle` 을 끼우지 않는다.** 뒤에 교전이 더 있으면
  다음 `focus` 가 이어받는다. 매번 원경으로 빠지면 화면이 깜빡인다 (D-7 로 교전이 여러 건이 됐다)
- 피해 → `shake`. 세기는 `min(1, 피해량 / 30)`, 처형은 피해량과 무관하게 최대
- 같은 상태로 다시 가는 명령은 내지 않는다 (`pushShot` 이 걸러낸다)

`CameraShot` 이 상태의 유일한 출처다. 카메라를 움직이는 주체가 둘이 되지 않게 한 것이다.

---

## 7. 지켜야 할 것

1. `src/render/`·`src/camera/` 에 **DOM·three.js·브라우저 API import 금지**
2. 좌표 상수를 코드에 박지 않는다. 매니페스트에서 읽는다
3. 이펙트 id·프레임 id 를 코드에 박지 않는다. 바인딩 파일이나 이름 규칙으로 찾는다
   (`frameEndingWith('idle')`, `frameSequence('S2')`, `effectsByAnchor('hitPoint')`)
4. 새 캐릭터는 `assets/<캐릭터>/` 에 파일 두 개를 넣으면 끝난다. **코드를 고치지 않는다**
5. 이벤트 순서를 어댑터에서 재배열하지 않는다. 순서의 출처는 도메인이다

---

## 8. 아직 없는 것

| 항목 | 현황 |
|---|---|
| 실제 렌더러 | **미구현.** 명령을 받아 그리는 층이 없다 |
| 2.5D 카메라·바닥·벽 배치 | 미정. FOV, 바닥 기울기, 스프라이트 빌보딩 방식이 안 정해졌다 |
| 프레임 재생 시간 | 미정. `playFrames` 는 순서만 주고 장당 시간을 안 준다 |
| UI 계층 | 미구현. 프로필 패널·정신력 바·타겟 화살표·합 승·패 배지 등 원작 승계분 |
| 명중점 최종값 | `hitPoint` 는 접지점·머리 중간을 쓰는 중. 스프라이트를 눈으로 보고 다시 잡는다 |
| 확대 배율 | `FOCUS_ZOOM 1.6` 은 임시값 |

**2.5D 는 유지한다.** perspective 카메라로 바닥·벽과 2D 캐릭터의 각도를 살리는 게 이 게임의
핵심 인상이고, 원본 카메라 버그는 2.5D 탓이 아니라 상태 소유권이 없어서 난 것이다.
직교 2D 로 바꾸지 않는다.
