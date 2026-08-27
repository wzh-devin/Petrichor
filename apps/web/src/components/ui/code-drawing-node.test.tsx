// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeDrawingPreviewArea } from './code-drawing-node';

afterEach(() => cleanup());

describe('CodeDrawingPreviewArea', () => {
  it('以鼠标指针为锚点缩放流程图', async () => {
    const image = `data:image/svg+xml;base64,${btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800"></svg>'
    )}`;
    render(
      <CodeDrawingPreviewArea
        image={image}
        loading={false}
        error={null}
        code="graph TD; A-->B"
        viewMode="Image"
        readOnly
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '放大查看流程图' }));
    const expandedImage = await screen.findByAltText('放大的代码图表');
    const stage = expandedImage.parentElement as HTMLDivElement;
    const viewport = stage.parentElement as HTMLDivElement;

    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800,
    } as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(() => {
      const zoom = Number.parseFloat(stage.style.width) / 100;
      return {
        left: -viewport.scrollLeft,
        top: -viewport.scrollTop,
        width: 1000 * zoom,
        height: 800 * zoom,
      } as DOMRect;
    });

    fireEvent.wheel(expandedImage, {
      clientX: 800,
      clientY: 200,
      ctrlKey: true,
      deltaY: -1,
    });

    expect(screen.getByText('110%')).toBeTruthy();
    expect(viewport.scrollLeft).toBeCloseTo(80);
    expect(viewport.scrollTop).toBeCloseTo(20);
  });
});
