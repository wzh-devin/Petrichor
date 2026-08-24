// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { resolveBlockDragPreviewSource } from './block-drag-preview';

describe('resolveBlockDragPreviewSource', () => {
  it('优先使用真实组件预览根节点', () => {
    const block = document.createElement('div');
    const component = document.createElement('div');
    component.dataset.plateDragPreview = '';
    block.append(component);

    expect(resolveBlockDragPreviewSource(block)).toBe(component);
  });

  it('普通块回退到块根节点', () => {
    const block = document.createElement('div');

    expect(resolveBlockDragPreviewSource(block)).toBe(block);
  });
});
