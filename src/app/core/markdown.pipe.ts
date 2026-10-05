import { Pipe, PipeTransform } from '@angular/core';
import { Marked } from 'marked';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Formats the agent's Markdown (bold, italics, lists, paragraphs). Raw HTML written by the
 * model is shown as text, never interpreted; Angular's [innerHTML] sanitizer is a second guard.
 */
const markdown = new Marked({
  gfm: true,
  breaks: true, // a single line break in the reply stays a line break
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    return markdown.parse(text ?? '', { async: false });
  }
}
