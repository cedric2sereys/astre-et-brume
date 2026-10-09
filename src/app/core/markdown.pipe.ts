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

/**
 * The reply as plain text, for reading aloud: no Markdown symbols, and each paragraph,
 * list item or heading ends with punctuation so the voice pauses between them.
 */
export function markdownToText(text: string): string {
  const html = markdown.parse(text ?? '', { async: false });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, tr, td, th').forEach((el) => {
    el.before('\n');
    el.after('\n');
  });
  return (doc.body.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;,]$/.test(line) ? line : line + '.'))
    .join('\n');
}

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    return markdown.parse(text ?? '', { async: false });
  }
}
