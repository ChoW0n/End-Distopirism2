//게임 화면만 전체화면으로 (SPEC-004 §13.6). 표준 Fullscreen API, 안 되면 webkit 접두 판
//둘 다 없으면(iPhone Safari 등) 버튼을 숨긴다. 켜짐 표시는 fullscreenchange 로만 바꾼다

//webkit 접두 판까지 가진 문서·요소 모양
interface PrefixedDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}
interface PrefixedElement {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

//지금 전체화면인 요소
function current(): Element | null {
  const d = document as unknown as PrefixedDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

//이 브라우저가 요소 전체화면을 할 수 있는지
export function fullscreenSupported(target: Element): boolean {
  const d = document as unknown as PrefixedDocument;
  const e = target as unknown as PrefixedElement;
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  return enabled && (typeof e.requestFullscreen === 'function' || typeof e.webkitRequestFullscreen === 'function');
}

//들어가거나 나온다. 거절되면 조용히 그대로 둔다
async function toggle(target: Element): Promise<void> {
  const d = document as unknown as PrefixedDocument;
  const e = target as unknown as PrefixedElement;
  try {
    if (current()) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
      return;
    }
    if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: 'hide' });
    else e.webkitRequestFullscreen?.();
    //휴대폰이면 가로로 잠가 본다. 안 되는 기기가 많다
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape').catch(() => undefined);
  } catch {
    //사용자가 막았거나 틀(iframe)이 허락하지 않았다
  }
}

//버튼을 게임 화면 요소에 잇는다. 지원하지 않으면 버튼을 숨긴 채 둔다
export function bindFullscreen(target: Element, button: HTMLElement | null): void {
  if (!button) return;
  button.hidden = !fullscreenSupported(target);
  if (button.hidden) return;
  const show = (): void => {
    const on = current() === target;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? '전체화면 끄기' : '전체화면');
  };
  button.addEventListener('click', () => void toggle(target));
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  show();
}
