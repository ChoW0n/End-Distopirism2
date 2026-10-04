# End-Distopirism2 검토·인계 묶음 — 2026-10-04 갱신

아스트라 작업용 실행 묶음. 본 가지(`claude/trusting-keller-2qeupr`)와 역사를 공유하지 않는 고아 가지다.
코드 기준 커밋은 `BUILD.json` 의 `commit` (2026-10-04: 행동력·여러 턴 예약 + 박진감 연출 반영).

- **인계 문서**: [`docs/HANDOFF-001-아스트라-데모까지.md`](docs/HANDOFF-001-아스트라-데모까지.md) — 시연 데모 지향점·완료 기준·현재 연출·수치 지도(수치는 아스트라가 정한다)·작업 순서
- 검토 요청서: [`docs/REVIEW-001-아스트라-검토요청.md`](docs/REVIEW-001-아스트라-검토요청.md)
- 스크린샷: [`screenshots/`](screenshots/) · 자동 검사: `BUILD.json`

## 켜는 법

```
git clone -b review-2026-10-03 --single-branch --depth 1 https://github.com/ChoW0n/End-Distopirism2.git ed2-review
cd ed2-review
python3 -m http.server 8000
# 브라우저로 http://localhost:8000/
```

`file://` 로는 열리지 않는다. WebGL 되는 데스크톱 Chrome·Edge 기준.

| 화면 | 경로 |
|---|---|
| 전투 | `web/battle.html` |
| 공간형 VFX | `web/vfx-space.html` |
| 물금 실시간 VFX | `web/vfx-lab.html` |

그림·소리는 검토·작업용으로만 싣는다. 리포 본 가지에는 커밋하지 않는다.
