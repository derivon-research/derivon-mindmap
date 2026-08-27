import { describe, expect, it } from 'vitest';
import { isBenignResizeObserverWarning, isStoredResizeObserverWarning } from './crashReport';

describe('frontend crash filtering', () => {
  it('ignores browser ResizeObserver loop notifications without hiding real errors', () => {
    const message = 'ResizeObserver loop completed with undelivered notifications.';

    expect(isBenignResizeObserverWarning(message, null)).toBe(true);
    expect(isBenignResizeObserverWarning('ResizeObserver loop limit exceeded', undefined)).toBe(true);
    expect(isBenignResizeObserverWarning(message, new Error(message))).toBe(false);
    expect(isBenignResizeObserverWarning('ResizeObserver callback failed', null)).toBe(false);
  });

  it('recognizes only persisted reports containing the bare browser warning', () => {
    const warning = [
      '来源: 前端未处理异常',
      '时间: 2026-08-27T18:52:48.656Z',
      '页面: http://127.0.0.1:5180/',
      'User agent: Chromium',
      '',
      'ResizeObserver loop completed with undelivered notifications.',
    ].join('\n');

    expect(isStoredResizeObserverWarning(warning)).toBe(true);
    expect(isStoredResizeObserverWarning(`${warning}\n    at callback.ts:1:1`)).toBe(false);
    expect(isStoredResizeObserverWarning(warning.replace('前端未处理异常', '文档保存失败'))).toBe(false);
  });
});
