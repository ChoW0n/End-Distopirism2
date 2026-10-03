# End-Distopirism2 검토 묶음 — 2026-10-03

아스트라 진행률 검토용 실행 묶음. 본 가지(`claude/trusting-keller-2qeupr`)와 역사를 공유하지 않는 고아 가지다.
코드 기준 커밋은 `BUILD.json` 의 `commit`.

- 검토 요청서: [`docs/REVIEW-001-아스트라-검토요청.md`](docs/REVIEW-001-아스트라-검토요청.md) — 진행 현황, 검토 항목 R1~R6, 결과 형식
- 스크린샷: [`screenshots/`](screenshots/)
- 자동 검사: `BUILD.json` (타입 검사 통과, 테스트 490/490)

## 켜는 법

```
git clone -b review-2026-10-03 --single-branch --depth 1 https://github.com/ChoW0n/End-Distopirism2.git ed2-review
cd ed2-review
python3 -m http.server 8000
# 브라우저로 http://localhost:8000/
```

`file://` 로는 열리지 않는다. WebGL 되는 데스크톱 Chrome·Edge 기준. 헤드리스는 `--use-gl=swiftshader --enable-unsafe-swiftshader`.

| 화면 | 경로 |
|---|---|
| 전투 | `web/battle.html` |
| 공간형 VFX | `web/vfx-space.html` |
| 물금 실시간 VFX | `web/vfx-lab.html` |

그림·소리는 검토용으로만 싣는다. 검토가 끝나면 이 가지는 지운다.
