import { JSDOM } from "jsdom";
const dom = new JSDOM();
global.document = dom.window.document;
global.window = dom.window;

import DOMPurify from 'dompurify';
global.DOMPurify = DOMPurify(global.window);

import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({ startOnLoad: false });

const { svg } = await mermaid.render('diagram-1', 'flowchart-elk LR\n  A[Idea] --> B{Shape it}');
const nodeIds = [...svg.matchAll(/<g[^>]*class="[^"]*node[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]);
console.log("ELK Nodes:", nodeIds);

const { svg: svg2 } = await mermaid.render('diagram-2', 'flowchart LR\n  A[Idea] --> B{Shape it}');
const nodeIds2 = [...svg2.matchAll(/<g[^>]*class="[^"]*node[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]);
console.log("Dagre Nodes:", nodeIds2);
