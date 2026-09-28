// The Loopwright mark: a yarn ball with a hook through it, in theme colors.

import { svgFromString } from './dom.js';

export function brandMark(cls = 'brand-mark') {
  return svgFromString(`<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="29" cy="35" r="19" fill="var(--accent)"/>
    <g fill="none" stroke="var(--accent-soft)" stroke-width="2.2" stroke-linecap="round" opacity=".9">
      <path d="M12.5 29.5c11-1.2 22.5 7 27 22.5"/><path d="M18.8 19.8c8.6 4.8 16.2 15.8 17.6 33"/>
      <path d="M34 17.3c-1.5 10.5-10.5 19-23.3 22"/><path d="M47.4 34.6c-8.8.8-18.8 7.2-24.5 17.5"/>
    </g>
    <g fill="none" stroke="var(--ink)" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.5 56 49 14.8" stroke-width="3.2"/><path d="M49 14.8c2-2.6 1.2-5.6-1.3-5.8-2-.2-3.3 1.5-2.8 3.3" stroke-width="2.6"/>
    </g></svg>`);
}
