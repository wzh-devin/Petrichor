const DRAG_PREVIEW_SELECTOR = '[data-plate-drag-preview]';

/**
 * 优先返回块内标记的真实组件根节点，避免拖拽预览包含整行编辑器空白。
 *
 * @param blockElement Plate 块对应的 DOM 根节点
 * @return 用于生成浏览器拖拽预览的 DOM 节点
 */
export const resolveBlockDragPreviewSource = (
  blockElement: HTMLElement
): HTMLElement =>
  blockElement.querySelector<HTMLElement>(DRAG_PREVIEW_SELECTOR) ??
  blockElement;
