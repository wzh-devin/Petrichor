'use client';

import * as React from 'react';

import type {
  CodeDrawingType,
  TCodeDrawingElement,
  ViewMode,
} from '@platejs/code-drawing';
import {
  VIEW_MODE,
  DEFAULT_MIN_HEIGHT,
  CODE_DRAWING_TYPE_ARRAY,
  VIEW_MODE_ARRAY,
  renderCodeDrawing,
  RENDER_DEBOUNCE_DELAY,
  downloadImage,
  DOWNLOAD_FILENAME,
} from '@platejs/code-drawing';
import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import debounce from 'lodash/debounce.js';
import {
  Trash2,
  DownloadIcon,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from '@/components/iconimate';

import { useIsMobile } from '@/hooks/use-mobile';
import {
  normalizeMermaidSvgDataUrl,
  readSvgDataUrlAspectRatio,
} from '@/components/plate/plate-mermaid';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function useCodeDrawingElement({ element }: { element: TCodeDrawingElement }) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<string>('');

  const lastRequestRef = React.useRef(0);

  // Debounced render when code or type changes
  const debouncedRender = React.useMemo(
    () =>
      debounce(
        async (code: string | undefined, drawingType: string | undefined) => {
          lastRequestRef.current += 1;
          const requestId = lastRequestRef.current;

          if (!code || !code.trim() || !drawingType) {
            setImage('');
            setLoading(false);
            setError(null);
            return;
          }

          setLoading(true);
          setError(null);

          try {
            const imageData = await renderCodeDrawing(
              drawingType as CodeDrawingType,
              code
            );

            // Only update if this is still the latest request
            if (lastRequestRef.current === requestId) {
              setImage(
                drawingType === 'Mermaid'
                  ? normalizeMermaidSvgDataUrl(imageData)
                  : imageData
              );
              setError(null);
            }
          } catch (err) {
            if (lastRequestRef.current === requestId) {
              setError(err instanceof Error ? err.message : 'Rendering failed');
              setImage('');
            }
          } finally {
            if (lastRequestRef.current === requestId) {
              setLoading(false);
            }
          }
        },
        RENDER_DEBOUNCE_DELAY
      ),
    []
  );

  React.useEffect(() => {
    debouncedRender(element.data?.code, element.data?.drawingType);

    return () => {
      debouncedRender.cancel();
    };
  }, [element.data?.code, element.data?.drawingType, debouncedRender]);

  const removeNode = () => {
    if (readOnly) return;

    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  };

  return {
    loading,
    error,
    image,
    removeNode,
  };
}

export function CodeDrawingElement(
  props: PlateElementProps<TCodeDrawingElement>
) {
  const isMobile = useIsMobile();
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const isFocusedLast = useFocusedLast();
  const element = useElement<TCodeDrawingElement>();
  const { removeNode, image, loading, error } = useCodeDrawingElement({ element });

  const handleDownload = React.useCallback(() => {
    if (!image) return;
    downloadImage(image, DOWNLOAD_FILENAME);
  }, [image]);

  const handleCodeChange = React.useCallback(
    (code: string) => {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes(
          {
            data: {
              ...element.data,
              code,
            },
          },
          { at: path }
        );
      }
    },
    [editor, element]
  );

  const handleDrawingTypeChange = React.useCallback(
    (drawingType: CodeDrawingType) => {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes(
          {
            data: {
              ...element.data,
              drawingType,
            },
          },
          { at: path }
        );
      }
    },
    [editor, element]
  );

  const handleDrawingModeChange = React.useCallback(
    (drawingMode: ViewMode) => {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes(
          {
            data: {
              ...element.data,
              drawingMode,
            },
          },
          { at: path }
        );
      }
    },
    [editor, element]
  );

  const code = element.data?.code ?? '';
  const drawingType = element.data?.drawingType ?? 'Mermaid';
  const configuredDrawingMode = element.data?.drawingMode ?? VIEW_MODE.Both;
  const drawingMode = drawingType === 'Mermaid'
    && (readOnly || configuredDrawingMode === VIEW_MODE.Both)
    ? VIEW_MODE.Image
    : configuredDrawingMode;

  const selectionCollapsed = useEditorSelector(
    (editor) => !editor.api.isExpanded(),
    []
  );

  const open = isFocusedLast && !readOnly && selected && selectionCollapsed;

  const content = (
    <PlateElement {...props}>
      <div contentEditable={false}>
        <CodeDrawingPreview
          code={code}
          drawingType={drawingType}
          drawingMode={drawingMode}
          image={image}
          loading={loading}
          error={error}
          onCodeChange={handleCodeChange}
          onDrawingTypeChange={handleDrawingTypeChange}
          onDrawingModeChange={handleDrawingModeChange}
          readOnly={readOnly}
          isMobile={isMobile}
        />
      </div>
    </PlateElement>
  );

  if (readOnly) {
    return content;
  }

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor asChild>{content}</PopoverAnchor>
      <PopoverContent
        className="w-auto p-1"
        contentEditable={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1">
          {image && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={handleDownload}
              title="Export"
            >
              <DownloadIcon className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={removeNode}
            title="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CodeDrawingPreview({
  code,
  drawingType,
  drawingMode,
  image,
  loading,
  error,
  onCodeChange,
  onDrawingTypeChange,
  onDrawingModeChange,
  readOnly = false,
  isMobile = false,
}: {
  code: string;
  drawingType: CodeDrawingType;
  drawingMode: ViewMode;
  image: string;
  loading: boolean;
  error: string | null;
  onCodeChange: (code: string) => void;
  onDrawingTypeChange: (type: CodeDrawingType) => void;
  onDrawingModeChange: (mode: ViewMode) => void;
  readOnly?: boolean;
  isMobile?: boolean;
}) {
  const viewMode = drawingMode;
  const showCode = viewMode === VIEW_MODE.Both || viewMode === VIEW_MODE.Code;
  const showBorder = viewMode === VIEW_MODE.Both;

  const handleCodeChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onCodeChange(e.target.value);
    },
    [onCodeChange]
  );

  const toolbar = readOnly ? null : (
    <CodeDrawingToolbar
      drawingType={drawingType}
      viewMode={viewMode}
      readOnly={readOnly}
      isMobile={isMobile}
      onDrawingTypeChange={onDrawingTypeChange}
      onDrawingModeChange={onDrawingModeChange}
    />
  );

  return (
    <div
      className={`flex ${isMobile ? 'flex-col-reverse' : 'flex-col'} group my-4 w-full items-stretch border bg-muted/50 md:flex-row`}
      style={{
        minHeight: `${DEFAULT_MIN_HEIGHT}px`,
      }}
    >
      {showCode && (
        <CodeDrawingTextarea
          code={code}
          viewMode={viewMode}
          readOnly={readOnly}
          isMobile={isMobile}
          showBorder={showBorder}
          onCodeChange={handleCodeChange}
          toolbar={viewMode === VIEW_MODE.Code ? toolbar : null}
        />
      )}

      {viewMode !== VIEW_MODE.Code && (
        <CodeDrawingPreviewArea
          image={image}
          loading={loading}
          error={error}
          code={code}
          viewMode={viewMode}
          readOnly={readOnly}
          isMobile={isMobile}
          showBorder={showBorder}
          toolbar={toolbar}
          onEditCode={
            !readOnly && drawingType === 'Mermaid' && viewMode === VIEW_MODE.Image
              ? () => onDrawingModeChange(VIEW_MODE.Code)
              : undefined
          }
        />
      )}
    </div>
  );
}

function CodeDrawingToolbar({
  drawingType,
  viewMode,
  readOnly = false,
  isMobile = false,
  onDrawingTypeChange,
  onDrawingModeChange,
}: {
  drawingType: CodeDrawingType;
  viewMode: ViewMode;
  readOnly?: boolean;
  isMobile?: boolean;
  onDrawingTypeChange: (type: CodeDrawingType) => void;
  onDrawingModeChange: (mode: ViewMode) => void;
}) {
  const [toolbarVisible, setToolbarVisible] = React.useState(false);
  const [languageSelectOpen, setLanguageSelectOpen] = React.useState(false);
  const [viewModeSelectOpen, setViewModeSelectOpen] = React.useState(false);

  const opacityClass =
    isMobile || toolbarVisible || languageSelectOpen || viewModeSelectOpen
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100';

  const positionClass = isMobile
    ? 'flex items-center gap-2'
    : 'absolute right-2 z-10 flex items-center gap-2';

  return (
    <div
      role="toolbar"
      className={`${positionClass} transition-opacity ${opacityClass}`}
      onMouseEnter={() => setToolbarVisible(true)}
      onMouseLeave={() => {
        if (!languageSelectOpen && !viewModeSelectOpen) {
          setToolbarVisible(false);
        }
      }}
    >
      {!readOnly && (
        <Select
          value={drawingType}
          onValueChange={onDrawingTypeChange}
          open={languageSelectOpen}
          onOpenChange={setLanguageSelectOpen}
        >
          <SelectTrigger
            className={`h-8 w-[120px] border-0 bg-muted/50 text-xs shadow-none ${
              isMobile ? '' : 'transition-colors hover:bg-zinc-200'
            }`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {CODE_DRAWING_TYPE_ARRAY.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!readOnly && (
        <Select
          value={viewMode}
          onValueChange={onDrawingModeChange}
          open={viewModeSelectOpen}
          onOpenChange={setViewModeSelectOpen}
        >
          <SelectTrigger
            className={`h-8 w-[80px] border-0 bg-muted/50 text-xs shadow-none ${
              isMobile ? '' : 'transition-colors hover:bg-zinc-200'
            }`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {VIEW_MODE_ARRAY.filter(
              (item) => drawingType !== 'Mermaid' || item.value !== VIEW_MODE.Both
            ).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function CodeDrawingTextarea({
  code,
  viewMode,
  readOnly = false,
  isMobile = false,
  showBorder = false,
  onCodeChange,
  toolbar,
}: {
  code: string;
  viewMode: ViewMode;
  readOnly?: boolean;
  isMobile?: boolean;
  showBorder?: boolean;
  onCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  toolbar?: React.ReactNode;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const isCodeOnlyMode = viewMode === VIEW_MODE.Code;

  const [internalCode, setInternalCode] = React.useState(code);
  const lastExternalCodeRef = React.useRef(code);

  React.useEffect(() => {
    if (code !== lastExternalCodeRef.current) {
      lastExternalCodeRef.current = code;
      setInternalCode(code);
    }
  }, [code]);

  React.useEffect(() => {
    if (isCodeOnlyMode && !readOnly) textareaRef.current?.focus();
  }, [isCodeOnlyMode, readOnly]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInternalCode(newValue);
      onCodeChange(e);
    },
    [onCodeChange]
  );

  return (
    <div
      className={`${
        isCodeOnlyMode ? 'w-full' : 'min-w-0 flex-1'
      } flex flex-col ${isCodeOnlyMode && !isMobile ? 'relative' : ''} ${
        showBorder && !isMobile ? 'border-r' : ''
      }`}
    >
      {toolbar && isCodeOnlyMode && (
        <div
          className={
            isMobile
              ? 'mt-2 mb-2 flex justify-end px-2'
              : 'absolute right-2 z-10 mt-2'
          }
        >
          {toolbar}
        </div>
      )}

      <div className="relative flex-1 rounded-md">
        <pre
          className={
            'm-0 overflow-x-auto p-8 pr-4 font-mono text-sm leading-[normal] [tab-size:2] print:break-inside-avoid'
          }
          style={{ minHeight: `${DEFAULT_MIN_HEIGHT}px`, height: '100%' }}
        >
          <code className="block h-full w-full">
            <textarea
              ref={textareaRef}
              value={internalCode}
              onChange={handleChange}
              readOnly={readOnly}
              className="m-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-0 font-mono text-sm outline-none"
              style={{ minHeight: `${DEFAULT_MIN_HEIGHT}px` }}
              placeholder="Enter your code here..."
              spellCheck={false}
            />
          </code>
        </pre>
      </div>
    </div>
  );
}

function CodeDrawingPreviewArea({
  image,
  loading,
  error,
  code,
  viewMode,
  readOnly = false,
  isMobile = false,
  showBorder = false,
  toolbar,
  onEditCode,
}: {
  image: string;
  loading: boolean;
  error: string | null;
  code: string;
  viewMode: ViewMode;
  readOnly?: boolean;
  isMobile?: boolean;
  showBorder?: boolean;
  toolbar?: React.ReactNode;
  onEditCode?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [spacePressed, setSpacePressed] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const zoomRef = React.useRef(1);
  const zoomModifierRef = React.useRef(false);
  const zoomFrameRef = React.useRef<number | null>(null);
  const panStartRef = React.useRef({ x: 0, y: 0, left: 0, top: 0 });
  const showImage = viewMode === VIEW_MODE.Both || viewMode === VIEW_MODE.Image;
  const imageAspectRatio = React.useMemo(
    () => readSvgDataUrlAspectRatio(image),
    [image]
  );

  const handleExpandedChange = React.useCallback((open: boolean) => {
    setExpanded(open);
    if (!open) {
      zoomRef.current = 1;
      zoomModifierRef.current = false;
      setZoom(1);
      setSpacePressed(false);
      setPanning(false);
    }
  }, []);

  const changeZoom = React.useCallback((requestedZoom: number, anchor?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    const nextZoom = Math.min(3, Math.max(0.5, requestedZoom));
    if (!viewport || !stage || nextZoom === zoomRef.current) return;

    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const anchorX = anchor?.x ?? viewportRect.left + viewportRect.width / 2;
    const anchorY = anchor?.y ?? viewportRect.top + viewportRect.height / 2;
    const ratioX = stageRect.width > 0
      ? Math.min(1, Math.max(0, (anchorX - stageRect.left) / stageRect.width))
      : 0.5;
    const ratioY = stageRect.height > 0
      ? Math.min(1, Math.max(0, (anchorY - stageRect.top) / stageRect.height))
      : 0.5;

    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    zoomFrameRef.current = requestAnimationFrame(() => {
      const nextStageRect = stage.getBoundingClientRect();
      viewport.scrollLeft += nextStageRect.left + ratioX * nextStageRect.width - anchorX;
      viewport.scrollTop += nextStageRect.top + ratioY * nextStageRect.height - anchorY;
      zoomFrameRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') {
        zoomModifierRef.current = true;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') {
        zoomModifierRef.current = false;
        return;
      }
      if (event.code === 'Space') {
        setSpacePressed(false);
        setPanning(false);
      }
    };
    const handleBlur = () => {
      setSpacePressed(false);
      setPanning(false);
      zoomModifierRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    const handleWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current;
      const target = event.target;
      if (
        !viewport
        || !(target instanceof Node)
        || !viewport.contains(target)
        || (!event.ctrlKey && !event.metaKey && !zoomModifierRef.current)
      ) return;
      event.preventDefault();
      if (zoomFrameRef.current !== null) return;
      changeZoom(
        zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1),
        { x: event.clientX, y: event.clientY }
      );
    };
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('wheel', handleWheel, { capture: true });
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    };
  }, [changeZoom, expanded]);

  const handlePanStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!spacePressed || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    setPanning(true);
  }, [spacePressed]);

  const handlePanMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!panning) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = panStartRef.current.left - (event.clientX - panStartRef.current.x);
    viewport.scrollTop = panStartRef.current.top - (event.clientY - panStartRef.current.y);
  }, [panning]);

  const handlePanEnd = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!panning) return;
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    setPanning(false);
  }, [panning]);

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col ${isMobile ? '' : 'relative'} ${
        showBorder && isMobile ? 'border-b' : ''
      }`}
    >
      {toolbar && (
        <div
          className={
            isMobile
              ? 'mt-2 mb-2 flex justify-end px-2'
              : 'absolute right-2 z-10 mt-2'
          }
        >
          {toolbar}
        </div>
      )}

      {showImage ? (
        <div
          className={`relative flex flex-1 items-center justify-center overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-900 ${
            onEditCode ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring' : ''
          }`}
          role={onEditCode ? 'button' : undefined}
          tabIndex={onEditCode ? 0 : undefined}
          title={onEditCode ? '点击编辑 Mermaid 源代码' : undefined}
          aria-label={onEditCode ? '编辑 Mermaid 源代码' : undefined}
          onClick={onEditCode}
          onKeyDown={(event) => {
            if (onEditCode && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onEditCode();
            }
          }}
        >
          {loading && <div className="text-muted-foreground">Loading...</div>}
          {!loading && error && (
            <div role="alert" className="text-sm text-destructive" title={error}>
              图表语法有误，无法渲染
            </div>
          )}
          {!loading && !error && image && (
            <img
              src={image}
              alt="代码图表"
              className={imageAspectRatio ? 'mx-auto w-full object-contain' : 'max-h-full max-w-full object-contain'}
              style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined}
            />
          )}
          {!loading && !error && !image && (
            <div className="text-muted-foreground">
              {code.trim() ? 'Rendering...' : 'Preview will appear here'}
            </div>
          )}
          {readOnly && image && !loading && !error ? (
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-md border border-slate-300 bg-white/95 text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              aria-label="放大查看流程图"
              title="放大查看"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 className="size-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="pointer-events-none flex flex-1 items-center justify-center rounded-md border bg-muted/30 p-4 opacity-0">
          {/* Placeholder to maintain height */}
        </div>
      )}
      <Dialog open={expanded} onOpenChange={handleExpandedChange}>
        <DialogContent className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-slate-200 bg-slate-50 p-0 text-slate-900 sm:max-w-[calc(100vw-2rem)]">
          <DialogTitle className="sr-only">放大查看流程图</DialogTitle>
          <div className="relative flex h-14 shrink-0 items-center justify-center gap-1 border-b border-slate-200 bg-white px-14">
            <span className="absolute left-4 hidden text-xs text-slate-500 md:inline">
              按住空格拖动 · Ctrl/⌘ + 滚轮缩放
            </span>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="缩小流程图"
              title="缩小"
              disabled={zoom <= 0.5}
              onClick={() => changeZoom(zoomRef.current - 0.25)}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 min-w-20 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-slate-700 hover:bg-slate-100"
              aria-label="适应视图"
              title="适应视图"
              onClick={() => changeZoom(1)}
            >
              <RotateCcw className="size-3.5" />
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="放大流程图"
              title="放大"
              disabled={zoom >= 3}
              onClick={() => changeZoom(zoomRef.current + 0.25)}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div
            ref={viewportRef}
            className={`min-h-0 flex-1 overflow-auto p-4 md:p-6 ${
              panning ? 'cursor-grabbing select-none' : spacePressed ? 'cursor-grab select-none' : ''
            }`}
            onPointerDown={handlePanStart}
            onPointerMove={handlePanMove}
            onPointerUp={handlePanEnd}
            onPointerCancel={handlePanEnd}
          >
            <div
              ref={stageRef}
              className="flex items-center justify-center"
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                margin: zoom <= 1 ? 'auto' : undefined,
              }}
            >
              {image ? (
                <img
                  src={image}
                  alt="放大的代码图表"
                  className="h-full w-full object-contain object-center"
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
