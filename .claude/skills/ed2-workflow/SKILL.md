---
name: ed2-workflow
description: End-Distopirism2 에서 기능 구현·규칙 변경·수치 조정·연출/UI 작업·버그 수정을 시작할 때, 그리고 "완료·통과" 를 보고하기 전에 쓴다. 스펙 주도 개발에 superpowers·frontend-design·내장 스킬을 어디에 끼울지 정한 이 리포의 작업 절차다.
---

# 작업 절차 — End-Distopirism2

**우선순위: 사용자 직접 지시 > `CLAUDE.md` > 이 문서 > superpowers·기타 스킬.**
superpowers 의 "모든 응답 전에 스킬 호출", "승인 전 구현 금지" 같은 강한 문구는 이 문서의 표대로만 적용한다.
응답은 CLAUDE.md 규칙(한국어·존칭 없음·결과만)을 따른다.

---

## 1. 흐름

```
분류 → 이해 → 설계 게이트 → 계획 → 구현 → (버그면 디버깅) → 검증 → 리뷰 → 마무리
```

### ① 분류 — 한 줄로 먼저 말한다

| 분류 | 예 | 설계 게이트 |
|---|---|---|
| 질문·조사 | "이게 어떻게 돼?" | 없음. 코드 안 바꾼다 |
| 가능성 (spike) | "이거 되나?" | 답만 낸다. 만든 것은 버릴 것으로 표시, 커밋하지 않는다 |
| 수치 조정 | JSON 값, 카메라·템포 | 스펙 표에 같이 적는다. 사용자 확정 값(결행 문턱 등)이면 묻는다 |
| 한정 변경 | 기존 흐름 안의 수정·버그·UI 고치기 | **사용자가 구체적으로 지시했으면 계획 한 줄을 알리고 바로 진행** (지시가 승인이다) |
| 규칙·구조 변경 | 전투 규칙의 뜻, 입력 방식, 새 서브시스템, 인터페이스 변경 | **물어서 결정 → 스펙 먼저 쓰고 커밋 → 구현** |

헷갈리면 무거운 쪽. 하다가 커지면 멈추고 한 단계 올린다.

### ② 이해
- 코드는 `graft` 로 먼저 찾는다 (`ask`·`grep`·`callers`). 그다음 필요한 스팬만 읽는다
- 읽을 문서: 전투 = **SPEC-001 v1~v4**(현행 기준) · 연출 = SPEC-005 · UI = SPEC-004 · 세계관·적·배경 = STORY-001. SPEC-007 은 초안이고 데모 범위 밖
- 스펙의 TBD 가 미결이면 구현하지 않고 묻는다 (CLAUDE.md)

### ③ 설계 게이트 (superpowers:brainstorming 의 이 리포 판)
- 결정은 `AskUserQuestion` 으로 한 번에 묶어 묻는다. 선택지는 추천을 맨 앞에
- 규칙의 뜻이 바뀌는 것(회복 시점·빚 한도의 존재·합 조건·상태 지속)은 수치가 아니다. 반드시 묻는다. GPT 의 G-4 상태 지속 변경이 스펙 없이 들어왔다가 사용자 채택으로 SPEC-001 G-4.1 이 된 사례
- 결정 뒤: 스펙 문서 커밋 → 구현. 코드가 스펙과 다르면 코드가 틀린 것

### ④ 계획 (superpowers:writing-plans 의 이 리포 판)
- 작업 목록은 `TaskCreate` 로 2~5개 단위. 별도 plan 문서를 만들지 않는다 (`docs/superpowers/` 만들지 않는다)
- 스펙은 `docs/SPEC-*` 한 곳에만 둔다

### ⑤ 구현
| 대상 | 방법 |
|---|---|
| `src/domain/`, `src/render/` 순수 계산, `src/ui/` 입력 로직 | **테스트 먼저(TDD)**. 스펙 검증 항목을 실패하는 테스트로 옮기고 → 통과시킨다. 도메인에 DOM·three.js 금지 (`tests/architecture.test.ts`) |
| `src/renderer3d/`, DOM, CSS | 단위 테스트 대신 **실제 브라우저 캡처**로 확인. 계산이 있으면 `src/render/` 로 빼서 테스트 |
| JSON·스크립트·문서 | 테스트 없이 가능. 값을 고정한 테스트가 있으면 스펙을 따라 같이 고친다 (테스트를 지우거나 건너뛰지 않는다) |
- 수치는 JSON, 주석은 한국어 `//`, 클래스·주요 메서드에 빠짐없이
- 먼저 쓴 코드를 "지우고 처음부터"까지는 요구하지 않는다. 테스트를 먼저 쓰고 실패를 보는 것이 핵심

### ⑥ 디버깅 (superpowers:systematic-debugging)
재현(테스트 또는 캡처) → 원인 → 최소 수정 → 재발 방지 테스트. 증상 땜질 금지. 먼저 CLAUDE.md "알려진 함정" 표를 본다.
"flake" 는 원인이 아니다. 테스트를 건너뛰어 초록을 만들지 않는다.

### ⑦ 검증 (superpowers:verification-before-completion — 필수)
**이번 턴에 실행한 결과 없이 "됐다·통과"라고 하지 않는다.** 보고에는 숫자를 넣고, 못 돌린 것은 "미검증"으로 쓴다.

| 변경 | 돌릴 것 |
|---|---|
| 모든 코드 | `npm run typecheck` · `npm test` |
| 화면(web/·renderer3d) | `node web/build.mjs` 후 Playwright 캡처 (`--use-gl=swiftshader --enable-unsafe-swiftshader`), 콘솔 오류·404 확인 |
| 전투 규칙·수치 | `npm run sim -- --runs 200` 으로 판 길이·승률·결행 빈도 (데모 기준 HANDOFF-001 §3.3) |
| UI 그림 의존 | `node scripts/review_ui_assets.mjs` |
| 전달 묶음 | `node scripts/review_bundle.mjs` (타입 검사·테스트·404 검사 포함) |
| 공유본 | 올리기 전에 로컬 서버로 열어 404·오류 0 확인 |

### ⑧ 리뷰
- 큰 변경(여러 파일, 규칙 변경)은 푸시 전에 **`/code-review`** (내장). 서브에이전트 리뷰어는 쓰지 않는다
- 외부 리뷰는 아스트라(검토 가지 `review-2026-10-03`, REVIEW-001·HANDOFF-001)
- 리뷰를 받으면 (superpowers:receiving-code-review) 맞는지 코드로 확인하고 반영. 맹목적 동의 금지. 규칙의 뜻이 바뀌는 지적은 사용자에게 묻는다

### ⑨ 마무리 (superpowers:finishing-a-development-branch 의 이 리포 판)
- 커밋(`[Feat]`·`[Fix]`·`[Docs]`… + 한국어, 끝에 귀속 줄) → `git push -u origin claude/trusting-keller-2qeupr`. 푸시가 거부되면 `git pull --no-rebase` 로 합친다 (아스트라가 같은 가지에 올린다)
- 병합·PR·릴리스·가지 삭제는 **사용자가 요청할 때만**. 이 세션에서는 Release 를 만들 수 없다 (검토 가지로 대신)
- 이미지·소리는 커밋하지 않는다. 공유가 필요하면 Artifact 공유본이나 검토 가지

---

## 2. 스킬 사용표

### superpowers (프로젝트 범위로 켜 둠)

| 스킬 | 이 리포에서 | 비고 |
|---|---|---|
| brainstorming | **변형 사용** (③) | 분류·게이트는 쓰되 승인 방식은 AskUserQuestion·사용자 직접 지시 |
| writing-plans | **변형 사용** (④) | TaskCreate. 계획 문서 없음 |
| executing-plans | 사용 (인라인) | |
| test-driven-development | **도메인·순수 계산만** (⑤) | 렌더러는 캡처 검증 |
| systematic-debugging | 사용 (⑥) | |
| verification-before-completion | **필수** (⑦) | |
| receiving-code-review | 사용 (⑧) | |
| requesting-code-review | **끔** → `/code-review` | 서브에이전트 리뷰어 사용 불가 |
| using-git-worktrees | **끔** | 지정된 한 가지에서 작업 |
| finishing-a-development-branch | **끔** → ⑨ | 병합·PR 은 요청 시만 |
| subagent-driven-development · dispatching-parallel-agents | **끔** | CLAUDE.md 작업 절차: 서브에이전트는 사용자가 시킬 때만 |
| writing-skills | 스킬을 새로 만들 때만 | |
| diagnosing-superpowers | 세션이 이상할 때만 | |
| using-superpowers | 시작 훅이 넣는다. 위 표가 우선 | "질문에도 스킬부터" 는 적용하지 않는다 |

### 프로젝트·내장

| 스킬 | 언제 |
|---|---|
| graft | 코드 찾기·영향 범위의 첫 선택 (②) |
| **frontend-design** | 저장소 안에 **새 웹 화면·랜딩**을 만들 때 (시작 화면, 검토 묶음 첫 화면, 실험 화면). **전투 화면 UI는 SPEC-004 v4 금빛 체계·UI 묶음·STORY-001 §18 톤이 먼저다.** 스킬의 "브리프의 말이 우선" 원칙에 따라 이 문서들이 브리프다. 새로 정하는 글꼴·색은 그 체계 안에서만 |
| artifact-design · artifact-capabilities | claude.ai Artifact 페이지를 **직접 새로 쓸 때**. 만들어 둔 빌드를 그대로 올릴 때는 불필요 |
| code-review · simplify · security-review | 큰 변경 뒤 (⑧). simplify 는 품질만, 버그는 code-review |
| watch (claude-video) | 영상 분석 (유튜브 연출 조사. 네트워크가 허용될 때) |
| dataviz | 밸런스 결과를 차트로 낼 때 |
| session-start-hook · update-config · skill-creator · fewer-permission-prompts | 환경·스킬 설정을 만질 때 |
| docx · pdf · pptx · xlsx · docs · morning · claude-api · minecraft/magicspells 계열 | 이 프로젝트와 무관. 쓰지 않는다 |

---

## 3. 자주 쓰는 길

| 요청 | 길 |
|---|---|
| "수치 잡아줘 / 밸런스" | 분류=수치 → graft 로 키 찾기 → 바꾸기 → sim 200판 → 스펙 표에 `[튜닝 날짜·근거]` → 검증 ⑦ → 커밋 |
| "이 규칙 바꾸자" | 분류=규칙 → AskUserQuestion → SPEC 먼저 커밋 → 테스트 먼저 → 구현 → 검증 → code-review |
| "연출이 이상해" | 분류=한정 → 캡처로 재현 → 원인(시간표·카메라·z-order) → 수정 → 캡처 전/후 → 스펙 §에 검수 결과 한 줄 |
| "화면 하나 만들어" | 분류=구조 → 결정 → SPEC-004 확인 → frontend-design(체계 안에서) → 캡처·반응형 확인 |
| "버그" | systematic-debugging → 실패 테스트 → 고치기 → 검증 |
| "공유본 줘" | 빌드 → 로컬에서 404 0 확인 → 파일 목록 → Artifact 로 게시 → 링크 한 줄 |
