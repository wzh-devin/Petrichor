import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import {
  embedCardMarkdownRules,
  preprocessEmbedDirectives,
} from '@/components/plate/plate-embed-directives';
import { mermaidMarkdownRules } from '@/components/plate/plate-mermaid';

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
      rules: {
        ...embedCardMarkdownRules,
        ...mermaidMarkdownRules,
      },
    },
    parser: {
      transformData: ({ data }) => preprocessEmbedDirectives(data),
    },
  }),
];
