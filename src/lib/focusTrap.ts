export function trapFocus(event: KeyboardEvent, panel: HTMLElement) {
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    const active = document.activeElement;
    if (!panel.contains(active) || active === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    }
}
