const nodeId = "diagram-1777158045873-flowchart-TESTE-11";
let extracted = nodeId.replace(/^diagram-\d+-/, '');
console.log("After diagram strip:", extracted);
const match = extracted.match(/^flowchart-(.+?)-\d+$/);
if (match) {
  extracted = match[1];
} else {
  extracted = extracted.replace(/^flowchart-/, '');
}
console.log("After flowchart strip:", extracted);
