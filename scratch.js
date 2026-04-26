const nodeId1 = "flowchart-elk-A";
const nodeId2 = "flowchart-A-32";

function extract(nodeId, layout) {
  if (layout === "elk") {
    return nodeId.replace(/^flowchart-elk-/, '');
  } else {
    const match = nodeId.match(/^flowchart-(.+?)-\d+$/);
    if (match) {
      return match[1];
    } else {
      return nodeId.replace(/^flowchart-/, '');
    }
  }
}

console.log("elk:", extract(nodeId1, "elk")); // expected A
console.log("dagre:", extract(nodeId2, "dagre-wrapper")); // expected A
console.log("elk with hyphen:", extract("flowchart-elk-my-node-1", "elk")); // expected my-node-1
console.log("dagre with hyphen:", extract("flowchart-my-node-1-32", "dagre-wrapper")); // expected my-node-1
