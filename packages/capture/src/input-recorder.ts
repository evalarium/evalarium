import { randomUUID } from 'node:crypto';

import type { InputEvent } from '@evalarium/core';
import type { Page } from 'playwright-core';

interface BrowserClickPayload {
  readonly kind: 'click';
  readonly selector: string;
  readonly button: 'left' | 'middle' | 'right';
}

interface BrowserTypePayload {
  readonly kind: 'type';
  readonly selector: string;
  readonly value: string;
}

type BrowserInputPayload = BrowserClickPayload | BrowserTypePayload;

interface PendingEvent {
  readonly timestampMs: number;
  readonly payload:
    BrowserInputPayload | { readonly kind: 'navigate'; readonly url: string };
}

const INPUT_RECORDER_SOURCE = `(() => {
  const selectorFor = (element) => {
    const unique = (selector) => {
      try {
        return document.querySelectorAll(selector).length === 1
          ? selector
          : null;
      } catch {
        return null;
      }
    };
    const dataCy = element.getAttribute('data-cy');
    if (dataCy) {
      const selector = unique('[data-cy="' + CSS.escape(dataCy) + '"]');
      if (selector) return selector;
    }
    const dataTestId = element.getAttribute('data-testid');
    if (dataTestId) {
      const selector = unique('[data-testid="' + CSS.escape(dataTestId) + '"]');
      if (selector) return selector;
    }
    const isVolatileId = (id) => /_r_|^r_|^:r/.test(id);
    if (element.id && !isVolatileId(element.id)) {
      const selector = unique('#' + CSS.escape(element.id));
      if (selector) return selector;
    }
    const segments = [];
    let current = element;
    while (current && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current.tagName)
        : [];
      const suffix = siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : '';
      segments.unshift(tag + suffix);
      current = current.parentElement;
    }
    return segments.join(' > ');
  };
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const buttons = ['left', 'middle', 'right'];
    window.__evalariumRecordEvent({
      kind: 'click',
      selector: selectorFor(event.target),
      button: buttons[event.button] || 'left',
    });
  }, true);
  document.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)) return;
    window.__evalariumRecordEvent({
      kind: 'type',
      selector: selectorFor(event.target),
      value: event.target.value,
    });
  }, true);
})();`;

const isBrowserInputPayload = (
  value: unknown,
): value is BrowserInputPayload => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === 'click') {
    return (
      typeof record.selector === 'string' &&
      ['left', 'middle', 'right'].includes(String(record.button))
    );
  }
  return (
    record.kind === 'type' &&
    typeof record.selector === 'string' &&
    typeof record.value === 'string'
  );
};

export interface InputRecorder {
  beginTrace(): void;
  events(): readonly InputEvent[];
}

export const installInputRecorder = async (
  page: Page,
  sessionId: string,
  startedAt: number,
): Promise<InputRecorder> => {
  const pending: PendingEvent[] = [];
  let initialNavigationSeen = false;
  let traceStartedAt = startedAt;

  await page.exposeBinding(
    '__evalariumRecordEvent',
    (_source, payload: unknown) => {
      if (!isBrowserInputPayload(payload)) {
        return;
      }
      const timestampMs = Date.now() - traceStartedAt;
      const previous = pending.at(-1);
      if (
        payload.kind === 'type' &&
        previous?.payload.kind === 'type' &&
        previous.payload.selector === payload.selector
      ) {
        pending[pending.length - 1] = { timestampMs, payload };
        return;
      }
      pending.push({ timestampMs, payload });
    },
  );

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) {
      return;
    }
    if (!initialNavigationSeen) {
      initialNavigationSeen = true;
      return;
    }
    const url = frame.url();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      pending.push({
        timestampMs: Date.now() - traceStartedAt,
        payload: { kind: 'navigate', url },
      });
    }
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: INPUT_RECORDER_SOURCE,
  });

  return {
    beginTrace: () => {
      pending.length = 0;
      traceStartedAt = Date.now();
    },
    events: () => {
      // A navigation near a click is that click's consequence (SPA routing
      // or link follow); replaying the click reproduces it. Binding round
      // trips can deliver the click after the navigation, so look both ways.
      const clickTimes = pending
        .filter((event) => event.payload.kind !== 'navigate')
        .map((event) => event.timestampMs);
      const independent = pending.filter(
        (event) =>
          event.payload.kind !== 'navigate' ||
          !clickTimes.some(
            (clickTime) => Math.abs(clickTime - event.timestampMs) <= 2_000,
          ),
      );
      return independent.map((event, sequence): InputEvent => {
        const base = {
          id: randomUUID(),
          sessionId,
          sequence,
          timestampMs: event.timestampMs,
        };
        if (event.payload.kind === 'navigate') {
          return { ...base, kind: 'navigate', url: event.payload.url };
        }
        if (event.payload.kind === 'type') {
          return {
            ...base,
            kind: 'type',
            selector: event.payload.selector,
            value: event.payload.value,
          };
        }
        return {
          ...base,
          kind: 'click',
          selector: event.payload.selector,
          button: event.payload.button,
        };
      });
    },
  };
};
