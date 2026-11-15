import { marked } from './vendor/marked/marked.esm.js';

export function parse(markdown) {
  return marked.parse(markdown);
}
