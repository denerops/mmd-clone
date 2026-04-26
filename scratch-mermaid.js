import mermaid from "mermaid";
mermaid.initialize({ startOnLoad: false });
const { svg } = await mermaid.render('test-id', 'flowchart LR\n  A[Idea] --> B{Shape it}');
console.log(svg);
