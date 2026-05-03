export const initialDiagram = `flowchart LR
  A[Idea] --> B{Shape it}
  B -->|Code| C[Mermaid source]
  B -->|Preview| D[Live board]
  C --> E[Export SVG]
  D --> E
  E --> F[Share a crisp diagram]

  class B,C,D,F calm`;

export const templates = [
  {
    id: "flowchart",
    name: "Flowchart",
    code: `flowchart TD
  A[Start] --> B{Is it?}
  B -- Yes --> C[OK]
  B -- No --> D[Not OK]
  C --> E[End]
  D --> E`,
    description: "Standard flowchart for processes and logic.",
  },
  {
    id: "sequence",
    name: "Sequence Diagram",
    code: `sequenceDiagram
  Alice->>John: Hello John, how are you?
  John-->>Alice: Great!
  Alice-)John: See you later!`,
    description: "Visualize interactions between objects in time order.",
  },
  {
    id: "gantt",
    name: "Gantt Chart",
    code: `gantt
  title A Gantt Diagram
  dateFormat  YYYY-MM-DD
  section Section
  A task           :a1, 2023-01-01, 30d
  Another task     :after a1  , 20d`,
    description: "Project management and schedule visualization.",
  },
  {
    id: "class",
    name: "Class Diagram",
    code: `classDiagram
  Animal <|-- Duck
  Animal <|-- Fish
  Animal <|-- Zebra
  Animal : +int age
  Animal : +String gender
  Animal: +isMammal()
  Animal: +mate()`,
    description: "Structure and relationships of object-oriented systems.",
  },
  {
    id: "er",
    name: "ER Diagram",
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
    description: "Data modeling for database design.",
  },
  {
    id: "mindmap",
    name: "Mindmap",
    code: `mindmap
  root((mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
    Research
      Personal
      Professional`,
    description: "Hierarchical brainstorming and ideation.",
  },
  {
    id: "git",
    name: "Git Graph",
    code: `gitGraph
  commit
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  commit
  commit`,
    description: "Visualize git workflows and branching.",
  },
] as const;

const GRAPHS_KEY = "mmd-graphs";
const ACTIVE_KEY = "mmd-active-graph";
const MAX_SNAPSHOTS = 20;

export type GraphSnapshot = { id: string; code: string; createdAt: number };
export type GraphRecord = { id: string; name: string; code: string; updatedAt: number; snapshots?: GraphSnapshot[] };
export type LayoutRenderer = "dagre-wrapper" | "elk";
export type DiagramTheme = "base" | "default" | "dark" | "forest" | "neutral" | "apple-glass";

export const createSnapshot = (code: string, createdAt = Date.now()): GraphSnapshot => ({
  id: crypto.randomUUID(),
  code,
  createdAt,
});

const trimSnapshots = (snapshots: GraphSnapshot[]) => snapshots.slice(0, MAX_SNAPSHOTS);

export const addSnapshot = (snapshots: GraphSnapshot[] | undefined, code: string, createdAt = Date.now()) =>
  trimSnapshots([createSnapshot(code, createdAt), ...(snapshots ?? [])]);

const ensureSnapshots = (graph: GraphRecord): GraphRecord => {
  if (graph.snapshots?.length) {
    return { ...graph, snapshots: trimSnapshots(graph.snapshots) };
  }
  return { ...graph, snapshots: [createSnapshot(graph.code, graph.updatedAt)] };
};

const loadGraphs = (): GraphRecord[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(GRAPHS_KEY) || "[]") as GraphRecord[];
    return parsed.map(ensureSnapshots);
  } catch {
    return [];
  }
};

export const saveGraphs = (graphs: GraphRecord[]) => {
  localStorage.setItem(GRAPHS_KEY, JSON.stringify(graphs));
};

const getActiveId = () => localStorage.getItem(ACTIVE_KEY) || "";
const setActiveId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);

export const setPersistedActiveId = (id: string) => setActiveId(id);

export const migrateLegacy = (): { graphs: GraphRecord[]; activeId: string } => {
  const legacy = localStorage.getItem("mermaidCode");
  let graphs = loadGraphs();
  let activeId = getActiveId();

  if (legacy && graphs.length === 0) {
    const id = crypto.randomUUID();
    const now = Date.now();
    graphs = [{ id, name: "My Graph", code: legacy, updatedAt: now, snapshots: [createSnapshot(legacy, now)] }];
    saveGraphs(graphs);
    setActiveId(id);
    activeId = id;
    localStorage.removeItem("mermaidCode");
  } else if (graphs.length === 0) {
    const id = crypto.randomUUID();
    const now = Date.now();
    graphs = [{ id, name: "My Graph", code: initialDiagram, updatedAt: now, snapshots: [createSnapshot(initialDiagram, now)] }];
    saveGraphs(graphs);
    setActiveId(id);
    activeId = id;
  } else {
    graphs = graphs.map(ensureSnapshots);
    saveGraphs(graphs);
  }

  if (!activeId || !graphs.find((graph) => graph.id === activeId)) {
    activeId = graphs[0].id;
    setActiveId(activeId);
  }

  return { graphs, activeId };
};

export const formatSnapshotTime = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const shapeOptions = [
  { id: "square", label: "Square", open: "[", close: "]", class: "rounded-none" },
  { id: "rounded", label: "Rounded", open: "(", close: ")", class: "rounded-md" },
  { id: "stadium", label: "Stadium", open: "([", close: "])", class: "rounded-full px-1.5 w-6 h-4" },
  { id: "diamond", label: "Diamond", open: "{", close: "}", class: "rotate-45 scale-75" },
  { id: "hexagon", label: "Hexagon", open: "{{", close: "}}", class: "" },
  { id: "circle", label: "Circle", open: "((", close: "))", class: "rounded-full aspect-square" },
  { id: "database", label: "Database", open: "[(", close: ")]", class: "" },
] as const;

export const bracketPairs = [
  ["[[", "]]"],
  ["[(", ")]"],
  ["([", "])"],
  ["((", "))"],
  ["[/", "/]"],
  ["[\\", "\\]"],
  ["{{", "}}"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
] as const;

export const awsIcons = [
  { id: "ec2", icon: "aws:res-amazon-ec2", name: "EC2", group: "Compute", glyph: "EC2" },
  { id: "lambda", icon: "aws:res-amazon-lambda", name: "Lambda", group: "Compute", glyph: "Lambda" },
  { id: "ecs", icon: "aws:res-amazon-elastic-container-service", name: "ECS", group: "Containers", glyph: "ECS" },
  { id: "eks", icon: "aws:res-amazon-elastic-kubernetes-service", name: "EKS", group: "Containers", glyph: "EKS" },
  { id: "s3", icon: "aws:res-amazon-s3", name: "S3", group: "Storage", glyph: "S3" },
  { id: "efs", icon: "aws:res-amazon-elastic-file-system", name: "EFS", group: "Storage", glyph: "EFS" },
  { id: "rds", icon: "aws:res-amazon-rds", name: "RDS", group: "Database", glyph: "RDS" },
  { id: "dynamodb", icon: "aws:res-amazon-dynamodb", name: "DynamoDB", group: "Database", glyph: "DDB" },
  { id: "aurora", icon: "aws:res-amazon-aurora", name: "Aurora", group: "Database", glyph: "Aurora" },
  { id: "vpc", icon: "aws:res-amazon-vpc", name: "VPC", group: "Networking", glyph: "VPC" },
  { id: "cloudfront", icon: "aws:res-amazon-cloudfront", name: "CloudFront", group: "Networking", glyph: "CF" },
  { id: "route53", icon: "aws:res-amazon-route-53", name: "Route 53", group: "Networking", glyph: "R53" },
  { id: "apigateway", icon: "aws:res-amazon-api-gateway", name: "API Gateway", group: "Application Integration", glyph: "API" },
  { id: "sqs", icon: "aws:res-amazon-simple-queue-service", name: "SQS", group: "Application Integration", glyph: "SQS" },
  { id: "sns", icon: "aws:res-amazon-simple-notification-service", name: "SNS", group: "Application Integration", glyph: "SNS" },
  { id: "eventbridge", icon: "aws:res-amazon-eventbridge", name: "EventBridge", group: "Application Integration", glyph: "EVB" },
  { id: "cloudwatch", icon: "aws:res-amazon-cloudwatch", name: "CloudWatch", group: "Management", glyph: "CW" },
  { id: "iam", icon: "aws:res-amazon-iam", name: "IAM", group: "Security", glyph: "IAM" },
  { id: "cognito", icon: "aws:res-amazon-cognito", name: "Cognito", group: "Security", glyph: "Cognito" },
  { id: "secretsmanager", icon: "aws:res-amazon-secrets-manager", name: "Secrets Manager", group: "Security", glyph: "Secrets" },
] as const;

export type AwsIcon = (typeof awsIcons)[number] & { group: string };

export const awsIconPrefixRegex = /^AWS:[A-Za-z0-9 ]+\s+(.+)$/;

export const awsIconByGlyph = new Map(awsIcons.map((icon) => [icon.glyph, icon]));

export const mermaidKeywords = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "gantt",
  "mindmap", "gitGraph", "journey", "timeline", "pie", "quadrantChart", "kanban", "architecture",
  "subgraph", "end", "classDef", "class", "style", "linkStyle", "click", "direction", "participant",
  "actor", "section", "title", "commit", "branch", "checkout", "merge",
]);
