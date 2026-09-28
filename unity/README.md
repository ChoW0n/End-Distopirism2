# 유니티 쪽 (SPEC-005 §8)

웹 포팅과 같은 저장소에서 유니티 재전환용 코드를 기른다. 전투 계산은 웹 도메인(`src/domain`)과 같은 규칙을 따르고,
여기에는 **연출만** 둔다.

## 준비

- Unity 2022.3 (원본 버전 2022.3.18f1)
- TextMeshPro (2022.3 기본 포함). 결과 알림 글에 쓴다. 처음 한 번 `Window > TextMeshPro > Import TMP Essential Resources`
- DOTween 무료판 (Asset Store 또는 Demigiant 배포본). 설치 후 `Tools > Demigiant > DOTween Utility Panel` 에서 Setup
- 이 폴더의 `Assets/` 를 유니티 프로젝트 `Assets/` 에 넣는다. `.meta` 는 반드시 같이 옮긴다 (CLAUDE.md 알려진 함정)

## 카일 1대1 무대 꾸리기

1. 카메라: **Perspective**. 빈 오브젝트 `Stage` 에 `Limbus25DStageBackdrop` 을 붙이고 층 그림을 넣는다.
   기본값은 제3 수문(`assets/map-gate3/placement.json`) 5층이다: far `01-far-gallery` · booth `02-gate-booth` · floor `03-battle-floor` ·
   water `04-water` · front `05-foreground`. 카메라는 시작할 때 기준 자세로 옮겨진다 (SPEC-005 §8.8). 캐릭터는 z=0 줄에, 배경은 +Z 쪽에 선다
   - front(근경)는 카메라 쪽 z=−4 에 서고 `hideInCombat` 이 켜져 있다. 교전 중에는 숨고 교전 사이에만 보인다 (SPEC-005 §9.5.1)
   - 층 그림 임포트: Texture Type `Default`, Alpha Is Transparency 켬, Read/Write 불필요
2. 빈 오브젝트 `Director` 에 `Limbus25DEffectDirector` 를 붙이고 카메라를 넣는다. `backdrop` 칸은 비워도 장면에서 찾는다.
   교전 한 건이 도는 동안 끼지 않은 인형은 흐려져 숨는다 (SPEC-005 §9.3)
3. 캐릭터마다: 루트 오브젝트 → 자식 `Visual` → 자식 `SpriteRenderer`. 루트에 `Limbus25DActor`
   - **장 채우기는 매니페스트로 한다**: 캐릭터 폴더(`assets/kyle/` 통째로 — `sprite-manifest.json` 과 `frames/`·`slash/`)를
     `Assets/` 아래에 넣고, 액터 오브젝트를 고른 뒤 `End-Distopirism > 매니페스트로 액터 장 채우기` 에서 매니페스트를 고른다.
     웹과 같은 규칙으로 맞춰진다: 장마다 발(anchor)이 피벗, 대기 장 키가 월드 2.0 이 되게 Pixels Per Unit,
     자세 장(대기·돌진·물러남·막기·피격)과 슬롯 장(S1·S2·S3 의 준비 → 맞닿음 → 궤적)이 칸에 들어간다. 궁극기는 S3 장을 빌린다
   - 장마다 원화 방향 체크 — 카일은 모든 장이 오른쪽이라 전부 켬(기본값). 다른 캐릭터는 장마다 얼굴이 향한 쪽을 보고 체크한다
   - 아군이면 `playerSide` 켬 (결과 알림은 아군에게만 뜬다, SPEC-005 §8.10). 시험 무대는 카일을 자동으로 켠다
   - 적 그림이 아직 없으면 적 액터에도 카일 매니페스트를 쓴다 (자리 표시. 이름표에 적는다)
4. 빈 오브젝트에 `Limbus25DDuelDemo` 를 붙이고 감독·카일·적을 넣는다. 재생하면 교전이 자동으로 돈다.
   세 번째 교전마다 맞부딪힘이 1~3 라운드(가끔 교착)로 돈다 (SPEC-005 §9.3). 카일은 S1·S2·S3 를 돌려 가며 낸다.
   가끔 빗나가고(피해 0, 넉백 없음), 체력이 0 이 되면 쓰러졌다가 새 판이 열린다

## 웹 3D 무대와 같은 것 (SPEC-005 §9, `src/renderer3d/stage.ts`)

| 웹 | 유니티 |
|---|---|
| 걸음 `oneSided` · `clash`(라운드·마무리) | `PresentationCue.OneSided` · `PresentationCue.ClashRounds` |
| 카드 슬롯마다 준비·맞닿음·궤적 장 | `WithSlots(공격 쪽, 받는 쪽)` + 액터 `skill1~3` |
| `defeated` → 가라앉으며 흐려짐 | `WithDefeat()` · 교전 밖이면 `Defeat(actor)` |
| 피해 숫자 · `흐트러짐` 딱지 (피해 25 이상) | 감독이 자동으로 띄움. 출혈 같은 교전 밖 피해는 `ShowNumber` |
| 결과 알림 상자 (어두운 상자 + 파랑/빨강 윗줄) | 같은 모양을 월드 글·판으로 그림 |
| 구경꾼·근경 숨기기 | 같음 (`bystanderFade` · `foregroundFade`) |
| 소리 (웹은 합성음) | `sound` 칸에 클립을 넣는다: 돌진·합·교착·타격·큰 타격·쓰러짐. 비우면 조용하다 |
| 카메라 흔들림 잡음·세기 곡선 | 같은 식 (사인 세 겹, 트라우마² smoothstep) |

웹에만 있는 것: 이름표·현황판·카드 고르기·속도 버튼. 유니티는 UI 계층에서 따로 만든다 (연출 감독 밖)


그림 파일은 저장소에 커밋하지 않는다 (SPEC-002 §9). 드라이브 원본에서 받는다.
