//겹창이 열리면 입력과 포커스를 안에 가두고, 닫을 때 원래 버튼으로 돌려준다
export class ModalController {
  private current: HTMLElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private readonly background = new Map<HTMLElement, boolean>();

  constructor(private readonly onClose: (dialog: HTMLElement) => void = () => undefined) {
    window.addEventListener('keydown', (event) => {
      const dialog = this.current;
      if (!dialog) return;
      //겹창의 버튼·선택 상자는 쓰되 전투 단축키로 전달하지 않는다
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Tab') {
        const items = this.focusable(dialog);
        const first = items[0] ?? dialog;
        const last = items[items.length - 1] ?? dialog;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    }, { capture: true });
    //무대가 새로 만든 이름표도 겹창 뒤에서는 누를 수 없다
    for (const type of ['pointerdown', 'click']) {
      window.addEventListener(type, (event) => {
        if (!this.current || (event.target instanceof Node && this.current.contains(event.target))) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
    }
    window.addEventListener('focusin', (event) => {
      if (!this.current || (event.target instanceof Node && this.current.contains(event.target))) return;
      (this.focusable(this.current)[0] ?? this.current).focus({ preventScroll: true });
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(dialog: HTMLElement | null, opener: HTMLElement | null): void {
    if (!dialog || dialog === this.current) return;
    this.close();
    this.returnFocus = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.current = dialog;
    dialog.hidden = false;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    //겹창의 조상은 살려 두고 각 단계의 형제만 비활성화한다
    for (let branch: HTMLElement | null = dialog; branch?.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
        this.background.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    (this.focusable(dialog)[0] ?? dialog).focus({ preventScroll: true });
  }

  close(): void {
    const dialog = this.current;
    if (!dialog) return;
    this.current = null;
    dialog.hidden = true;
    dialog.removeAttribute('aria-modal');
    for (const [element, inert] of this.background) element.inert = inert;
    this.background.clear();
    this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
    this.onClose(dialog);
  }

  private focusable(dialog: HTMLElement): HTMLElement[] {
    return [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled, [inert]') && element.getClientRects().length > 0);
  }
}
