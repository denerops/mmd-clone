import http from 'http';
import fs from 'fs';

const html = `
<!DOCTYPE html>
<html>
<body>
  <div id="diagram-1"></div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false });
    const { svg } = await mermaid.render('diagram-1', 'flowchart-elk LR\n  A[Idea] --> B{Shape it}');
    const { svg: svg2 } = await mermaid.render('diagram-2', 'flowchart LR\n  A[Idea] --> B{Shape it}');
    
    fetch('http://localhost:8888', {
      method: 'POST',
      body: JSON.stringify({
        elk: [...svg.matchAll(/<g[^>]*class="[^"]*node[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]),
        dagre: [...svg2.matchAll(/<g[^>]*class="[^"]*node[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1])
      })
    }).then(() => process.exit(0));
  </script>
</body>
</html>
`;
fs.writeFileSync('test.html', html);

http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    console.log(body);
    res.end('ok');
    process.exit(0);
  });
}).listen(8888, () => {
  console.log("Server listening on 8888");
});
