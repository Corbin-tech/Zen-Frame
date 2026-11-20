import { afterEach, expect, test, vi } from 'vitest';
import { trapFocus } from '../src/lib/focusTrap';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const element = (tabIndex = 0, disabled = false, visible = true) => ({
    tabIndex,
    matches: () => disabled,
    getClientRects: () => visible ? [{}] : [],
    focus: vi.fn(),
  });
  const first = element(), middle = element(), last = element();
  const elements = [element(-1), element(0, true), first, middle, last, element(0, false, false)];
  const panel = {
    querySelectorAll: vi.fn(() => elements),
    contains: (active: unknown) => elements.includes(active as typeof first),
  } as unknown as HTMLElement;
  const document = { activeElement: first as unknown };
  vi.stubGlobal('document', document);
  const event = (shiftKey = false) => ({ shiftKey, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
  return { first, middle, last, elements, panel, document, event };
}

test('wraps both boundaries, skipping hidden, disabled and negative-tabindex controls', () => {
  const f = fixture();
  const backward = f.event(true);
  trapFocus(backward, f.panel);
  expect(backward.preventDefault).toHaveBeenCalledOnce();
  expect(f.last.focus).toHaveBeenCalledOnce();
  f.document.activeElement = f.last;
  const forward = f.event();
  trapFocus(forward, f.panel);
  expect(forward.preventDefault).toHaveBeenCalledOnce();
  expect(f.first.focus).toHaveBeenCalledOnce();
});

test('leaves interior navigation to the browser', () => {
  const f = fixture();
  f.document.activeElement = f.middle;
  const event = f.event();
  trapFocus(event, f.panel);
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test('recovers outside focus in either direction', () => {
  const f = fixture();
  f.document.activeElement = null;
  trapFocus(f.event(), f.panel);
  trapFocus(f.event(true), f.panel);
  expect(f.first.focus).toHaveBeenCalledOnce();
  expect(f.last.focus).toHaveBeenCalledOnce();
});

test('does not intercept Tab when there are no eligible controls', () => {
  const f = fixture();
  f.elements.splice(0);
  const event = f.event();
  expect(() => trapFocus(event, f.panel)).not.toThrow();
  expect(event.preventDefault).not.toHaveBeenCalled();
});
