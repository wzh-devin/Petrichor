'use client';

import * as React from 'react';

import {
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  PaintBucketIcon,
  Settings2,
  StrikethroughIcon,
  UnderlineIcon,
} from '@/components/iconimate';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { AiAssistantToolbarButton } from '@/components/editor/ai-assistant/ai-toolbar-button';
import { AlignToolbarButton } from './align-toolbar-button';
import { CommentToolbarButton } from './comment-toolbar-button';
import { EmbedCardToolbarButton } from './embed-card-toolbar-button';
import { EmojiToolbarButton } from './emoji-toolbar-button';
import { FontColorToolbarButton } from './font-color-toolbar-button';
import { HighlighterToolbarButton } from './highlighter-toolbar-button';
import { RedoToolbarButton, UndoToolbarButton } from './history-toolbar-button';
import { InsertToolbarButton } from './insert-toolbar-classic-button';
import { LineHeightToolbarButton } from './line-height-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import {
  IndentToolbarButton,
  ListToolbarButton,
} from './list-classic-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MediaToolbarButton } from './media-toolbar-button';
import { ModeToolbarButton } from './mode-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { TableToolbarButton } from './table-toolbar-button';
import { ToggleToolbarButton } from './toggle-toolbar-button';
import { ToolbarButton, ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-classic-button';

export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();
  const [showMore, setShowMore] = React.useState(false);

  return (
    <div className="w-full">
      <div className="flex min-h-11 w-full items-center">
        {!readOnly && (
          <>
            <ToolbarGroup>
              <UndoToolbarButton />
              <RedoToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <AiAssistantToolbarButton />
              <InsertToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <TurnIntoToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <MarkToolbarButton nodeType={KEYS.bold} tooltip="加粗 (⌘+B)">
                <BoldIcon />
              </MarkToolbarButton>

              <MarkToolbarButton nodeType={KEYS.italic} tooltip="斜体 (⌘+I)">
                <ItalicIcon />
              </MarkToolbarButton>

              <MarkToolbarButton nodeType={KEYS.underline} tooltip="下划线 (⌘+U)">
                <UnderlineIcon />
              </MarkToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup>
              <ListToolbarButton nodeType={KEYS.ulClassic} />
              <ListToolbarButton nodeType={KEYS.olClassic} />
              <LinkToolbarButton />
            </ToolbarGroup>
          </>
        )}

        <div className="grow" />

        <ToolbarGroup>
          <HighlighterToolbarButton tooltip="手绘高亮 (⌘⇧H)" />
          <CommentToolbarButton />
        </ToolbarGroup>

        {!readOnly && (
          <ToolbarGroup>
            <ToolbarButton
              aria-label={showMore ? '收起工具' : '更多工具'}
              aria-expanded={showMore}
              pressed={showMore}
              tooltip={showMore ? '收起工具' : '更多工具'}
              onClick={() => setShowMore((value) => !value)}
            >
              <Settings2 />
            </ToolbarButton>
          </ToolbarGroup>
        )}

        <ToolbarGroup>
          <ModeToolbarButton />
        </ToolbarGroup>
      </div>

      {!readOnly && showMore && (
        <div className="flex min-h-11 w-full items-center overflow-x-auto border-t px-1 app-scrollbar">
          <ToolbarGroup>
            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="删除线 (⌘+⇧+M)"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="行内代码 (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>

            <FontColorToolbarButton nodeType={KEYS.color} tooltip="文字颜色">
              <BaselineIcon />
            </FontColorToolbarButton>

            <FontColorToolbarButton
              nodeType={KEYS.backgroundColor}
              tooltip="背景颜色"
            >
              <PaintBucketIcon />
            </FontColorToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <AlignToolbarButton />
            <ListToolbarButton nodeType={KEYS.taskList} />
            <ToggleToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <TableToolbarButton />
            <EmojiToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MediaToolbarButton nodeType={KEYS.img} />
            <MediaToolbarButton nodeType={KEYS.video} />
            <MediaToolbarButton nodeType={KEYS.audio} />
            <MediaToolbarButton nodeType={KEYS.file} />
            <EmbedCardToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <LineHeightToolbarButton />
            <IndentToolbarButton reverse />
            <IndentToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MoreToolbarButton />
          </ToolbarGroup>
        </div>
      )}
    </div>
  );
}
