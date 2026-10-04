# End-Distopirism2 QA 수정 검토본 · 2026-10-04

소스 기준: [`9eb975c`](https://github.com/ChoW0n/End-Distopirism2/commit/9eb975c4745ec67a70f3d4230c14cfcb8aa43ece). `BUILD.json`에 소스 트리와 검사 결과를 기록했다.

- [결함별 수정과 다음 작업](docs/QA-002-수정결과-2026-10-04.md)
- [브라우저 회귀 결과](docs/qa-2026-10-04-results.json), [이 실행 묶음 재검사](docs/qa-bundle-regression.json)
- [수정 검증 화면](screenshots/qa/)

타입 검사와 자동 검사 510개, 브라우저 31항목 통과. 이 묶음의 핵심 14항목도 다시 통과했고 정상 요청의 404·페이지 실행 오류는 0개다. 모든 UI 상태 의존성 85개를 포함한다.

S1 원본 색·붓결 일치 승인은 보류다. S3 측면 가독성 및 실제 iPhone/Safari는 후속 검수로 남긴다.

## 실행

```bash
git clone -b review-2026-10-03 --single-branch --depth 1 https://github.com/ChoW0n/End-Distopirism2.git ed2-review
cd ed2-review
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000/ 을 연다. `file://`로는 열리지 않는다. WebGL을 지원하는 Chromium 기준이다.

| 화면 | 경로 |
|---|---|
| 전투 | `web/battle.html` |
| 공간형 VFX | `web/vfx-space.html` |
| 물금 실시간 VFX | `web/vfx-lab.html` |

이 가지는 소스 브랜치와 분리한 검토용 실행 묶음이다. 그림·소리는 검토용으로 싣는다.
