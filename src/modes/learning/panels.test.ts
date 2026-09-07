import { describe, expect, it } from 'vitest';
import { DEFAULT_PANELS, answerNeedsWidth, setPanel } from './panels';

describe('setPanel', () => {
  it('expands one side by hiding the other, so the textbook never gives up width', () => {
    expect(setPanel(DEFAULT_PANELS, 'tutor', 'expanded')).toEqual({ tutor: 'expanded', rail: 'hidden' });
    expect(setPanel(DEFAULT_PANELS, 'rail', 'expanded')).toEqual({ tutor: 'hidden', rail: 'expanded' });
  });

  it('brings the hidden side back when the expanded one returns to its default width', () => {
    const expanded = setPanel(DEFAULT_PANELS, 'rail', 'expanded');
    expect(setPanel(expanded, 'rail', 'default')).toEqual({ tutor: 'default', rail: 'default' });
  });

  it('leaves the other side where it is when one is hidden by hand', () => {
    expect(setPanel(DEFAULT_PANELS, 'tutor', 'hidden')).toEqual({ tutor: 'hidden', rail: 'default' });
  });

  it('lets a learner hide both and read nothing but the textbook', () => {
    const withoutTutor = setPanel(DEFAULT_PANELS, 'tutor', 'hidden');
    expect(setPanel(withoutTutor, 'rail', 'hidden')).toEqual({ tutor: 'hidden', rail: 'hidden' });
  });

  it('does not disturb a side that is already showing', () => {
    const expanded = setPanel(DEFAULT_PANELS, 'tutor', 'expanded');
    expect(setPanel(expanded, 'tutor', 'default')).toEqual({ tutor: 'default', rail: 'default' });
  });
});

describe('answerNeedsWidth', () => {
  it('leaves prose alone, however long it runs', () => {
    expect(answerNeedsWidth('第 3 步做出来的，靠的是 数域 + 向量空间。要重看就点右边路线里的第 3 步。')).toBe(false);
    // Inline math inside a sentence still reads fine in a narrow column.
    expect(answerNeedsWidth('这里的 $V$ 就是上一步那个向量空间。')).toBe(false);
  });

  it('asks for width when a formula takes a line of its own', () => {
    expect(answerNeedsWidth('展开来是：\n$$\n\\dim(U + W) = \\dim U + \\dim W - \\dim(U \\cap W)\n$$')).toBe(true);
    expect(answerNeedsWidth('展开来是：\n\\[ T(v) = \\lambda v \\]')).toBe(true);
    expect(answerNeedsWidth('展开来是：\n$a_1 v_1 + \\dots + a_n v_n = 0$')).toBe(true);
  });

  it('asks for width when the answer embeds something to interact with', () => {
    expect(answerNeedsWidth('拖一下看看：\n<iframe src="./span.html"></iframe>')).toBe(true);
    expect(answerNeedsWidth('```interactive\n{"kind":"span-explorer"}\n```')).toBe(true);
  });
});
