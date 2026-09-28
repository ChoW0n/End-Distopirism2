# 유니티 쪽 (SPEC-005 §8)

웹 포팅과 같은 저장소에서 유니티 재전환용 코드를 기른다. 전투 계산은 웹 도메인(`src/domain`)과 같은 규칙을 따르고,
여기에는 **연출만** 둔다.

## 준비

- Unity 2022.3 (원본 버전 2022.3.18f1)
- TextMeshPro (2022.3 기본 포함). 결과 알림 글에 쓴다. 처음 한 번 `Window > TextMeshPro > Import TMP Essential Resources`
- DOTween 무료판 (Asset Store 또는 Demigiant 배포본). 설치 후 `Tools > Demigiant > DOTween Utility Panel` 에서 Setup
- 이 폴더의 `Assets/` 를 유니티 프로젝트 `Assets/` 에 넣는다. `.meta` 는 반드시 같이 옮긴다 (CLAUDE.md 알려진 함정)

## 카일 1대1 무대 꾸리기

1. 카메라: **Perspective**. 빈 오브젝트 `Stage` 에 `Limbus25DStageBackdrop` 을 붙이고 층 그림(far·mid·ground)을 넣는다.
   카메라는 시작할 때 기준 자세로 옮겨진다 (SPEC-005 §8.8). 캐릭터는 z=0 줄에, 배경은 +Z 쪽에 선다
   - 층 그림 임포트: Texture Type `Default`, Alpha Is Transparency 켬, Read/Write 불필요
2. 빈 오브젝트 `Director` 에 `Limbus25DEffectDirector` 를 붙이고 카메라를 넣는다
3. 캐릭터마다: 루트 오브젝트 → 자식 `Visual` → 자식 `SpriteRenderer`. 루트에 `Limbus25DActor`
   - 카일: 장마다 원화 방향 체크 — 모든 장이 오른쪽이라 전부 켬(기본값). 다른 캐릭터는 장마다 얼굴이 향한 쪽을 보고 체크한다. 장: 대기 `01-idle` · 준비 `02-preload` · 돌진 `03-user` · 타격 `slash/01-peak` · 타격 뒤 궤적 `slash/01~07` · 회복 `06-recover`
   - 아군이면 `playerSide` 켬 (결과 알림은 아군에게만 뜬다, SPEC-005 §8.10). 시험 무대는 카일을 자동으로 켠다
   - 스프라이트 피벗은 **발(아래 가운데)**. 카일 PNG 는 1280×720 캔버스라 Sprite Editor 에서 피벗을 발 위치로 맞춘다
   - 적 그림이 아직 없으면 적 액터에도 카일 장을 넣는다 (자리 표시. 이름표에 적는다)
4. 빈 오브젝트에 `Limbus25DDuelDemo` 를 붙이고 감독·카일·적을 넣는다. 재생하면 교전이 자동으로 돈다

그림 파일은 저장소에 커밋하지 않는다 (SPEC-002 §9). 드라이브 원본에서 받는다.
