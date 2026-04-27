import { type MouseEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { Download, FileJson, FolderOpen, Focus, Hand, HelpCircle, Menu, Minus, Moon, Palette, PanelLeftClose, PanelLeftOpen, Plus, Sun, Workflow, Maximize, Minimize, Play, Timer, Save, X, FilePlus, Share2, Trash2, FileCode, ChevronRight, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import LZString from "lz-string";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useTheme } from "@/components/theme-provider";

const initialDiagram = `flowchart LR
  A[Idea] --> B{Shape it}
  B -->|Code| C[Mermaid source]
  B -->|Preview| D[Live board]
  C --> E[Export SVG]
  D --> E
  E --> F[Share a crisp diagram]

  class B,C,D,F calm`;

const templates = [
  {
    id: "flowchart",
    name: "Flowchart",
    code: `flowchart TD
  A[Start] --> B{Is it?}
  B -- Yes --> C[OK]
  B -- No --> D[Not OK]
  C --> E[End]
  D --> E`,
    description: "Standard flowchart for processes and logic."
  },
  {
    id: "sequence",
    name: "Sequence Diagram",
    code: `sequenceDiagram
  Alice->>John: Hello John, how are you?
  John-->>Alice: Great!
  Alice-)John: See you later!`,
    description: "Visualize interactions between objects in time order."
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
    description: "Project management and schedule visualization."
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
    description: "Structure and relationships of object-oriented systems."
  },
  {
    id: "er",
    name: "ER Diagram",
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
    description: "Data modeling for database design."
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
    description: "Hierarchical brainstorming and ideation."
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
    description: "Visualize git workflows and branching."
  }
];

// ─── Multi-graph persistence helpers ────────────────────────────────────────
const GRAPHS_KEY = "mmd-graphs";
const ACTIVE_KEY = "mmd-active-graph";
const MAX_SNAPSHOTS = 20;

type GraphSnapshot = { id: string; code: string; createdAt: number };
type GraphRecord = { id: string; name: string; code: string; updatedAt: number; snapshots?: GraphSnapshot[] };

const createSnapshot = (code: string, createdAt = Date.now()): GraphSnapshot => ({
  id: crypto.randomUUID(),
  code,
  createdAt,
});

const trimSnapshots = (snapshots: GraphSnapshot[]) => snapshots.slice(0, MAX_SNAPSHOTS);

const addSnapshot = (snapshots: GraphSnapshot[] | undefined, code: string, createdAt = Date.now()) =>
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

const saveGraphs = (graphs: GraphRecord[]) => {
  localStorage.setItem(GRAPHS_KEY, JSON.stringify(graphs));
};

const getActiveId = () => localStorage.getItem(ACTIVE_KEY) || "";
const setActiveId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);

/** Migrate legacy single-graph save if present */
const migrateLegacy = (): { graphs: GraphRecord[]; activeId: string } => {
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

  if (!activeId || !graphs.find((g) => g.id === activeId)) {
    activeId = graphs[0].id;
    setActiveId(activeId);
  }

  return { graphs, activeId };
};

const formatSnapshotTime = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const shapeOptions = [
  { id: 'square', label: 'Square', open: '[', close: ']', class: 'rounded-none' },
  { id: 'rounded', label: 'Rounded', open: '(', close: ')', class: 'rounded-md' },
  { id: 'stadium', label: 'Stadium', open: '([', close: '])', class: 'rounded-full px-1.5 w-6 h-4' },
  { id: 'diamond', label: 'Diamond', open: '{', close: '}', class: 'rotate-45 scale-75' },
  { id: 'hexagon', label: 'Hexagon', open: '{{', close: '}}', class: 'w-5 h-4 border-l-0 border-r-0 relative before:absolute before:inset-0 before:border before:rotate-60 after:absolute after:inset-0 after:border after:-rotate-60' },
  { id: 'circle', label: 'Circle', open: '((', close: '))', class: 'rounded-full aspect-square' },
  { id: 'database', label: 'Database', open: '[(', close: ')]', class: 'rounded-sm border-t-2' },
] as const;

const bracketPairs = [
  ['[[', ']]'],
  ['[(', ')]'],
  ['([', '])'],
  ['((', '))'],
  ['[/','/]'],
  ['[\\', '\\]'],
  ['{{', '}}'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
] as const;

type LayoutRenderer = "dagre-wrapper" | "elk";
type DiagramTheme = "base" | "default" | "dark" | "forest" | "neutral" | "apple-glass";

const getMermaidConfig = (theme: DiagramTheme, layout: LayoutRenderer) => ({
  startOnLoad: false,
  securityLevel: "loose" as const,
  maxTextSize: 5_000_000,
  maxEdges: 100_000,
  layout: layout === "elk" ? "elk" : "dagre",
  flowchart: {
    defaultRenderer: layout,
  },
  theme: theme === "apple-glass" ? "base" : theme,
  themeVariables:
    theme === "base"
      ? {
        primaryColor: "#ccfbf1",
        primaryTextColor: "#102027",
        primaryBorderColor: "#14b8a6",
        lineColor: "#475569",
        secondaryColor: "#eef2ff",
        tertiaryColor: "#f8fafc",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }
      : theme === "apple-glass"
        ? {
          primaryColor: "rgba(255, 255, 255, 0.4)",
          primaryTextColor: "#1d1d1f",
          primaryBorderColor: "rgba(255, 255, 255, 0.7)",
          lineColor: "rgba(0, 0, 0, 0.25)",
          secondaryColor: "rgba(245, 245, 247, 0.4)",
          tertiaryColor: "rgba(229, 229, 234, 0.4)",
          clusterBkg: "rgba(255, 255, 255, 0.2)",
          clusterBorder: "rgba(0, 0, 0, 0.08)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', Roboto, sans-serif",
          edgeLabelBackground: "rgba(255, 255, 255, 0.65)",
          nodeBorder: "rgba(255, 255, 255, 0.8)",
        }
        : {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
});

const prepareSvgForSharpZoom = (rawSvg: string) => {
  const parser = new DOMParser();
  const document = parser.parseFromString(rawSvg, "image/svg+xml");
  const svgElement = document.querySelector("svg");

  if (!svgElement) {
    return { svg: rawSvg, size: { width: 900, height: 520 } };
  }

  const viewBox = svgElement.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const width = viewBox?.[2] || Number.parseFloat(svgElement.getAttribute("width") || "900") || 900;
  const height = viewBox?.[3] || Number.parseFloat(svgElement.getAttribute("height") || "520") || 520;

  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.style.removeProperty("max-width");
  svgElement.style.removeProperty("width");
  svgElement.style.removeProperty("height");
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgElement.setAttribute("shape-rendering", "geometricPrecision");
  svgElement.setAttribute("text-rendering", "geometricPrecision");

  return { svg: svgElement.outerHTML, size: { width, height } };
};

const applyLayoutToSource = (source: string, layout: LayoutRenderer) => {
  if (layout !== "elk") {
    return source.replace(/^\s*flowchart-elk\b/i, "flowchart");
  }

  return source.replace(/^(\s*)(flowchart|graph)\b/i, "$1flowchart-elk");
};

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize(getMermaidConfig("base", "elk"));

const Index = () => {
  const { theme, setTheme } = useTheme();

  // ── Multi-graph state ────────────────────────────────────────────────────
  const [graphs, setGraphs] = useState<GraphRecord[]>(() => migrateLegacy().graphs);
  const [activeId, setActiveIdState] = useState<string>(() => migrateLegacy().activeId);

  const activeGraph = graphs.find((g) => g.id === activeId) ?? graphs[0];

  const [code, setCode] = useState(() => activeGraph?.code ?? initialDiagram);
  const [savedCode, setSavedCode] = useState(() => activeGraph?.code ?? initialDiagram);

  // ── Menu state ───────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [newGraphName, setNewGraphName] = useState("");
  const [newGraphModalOpen, setNewGraphModalOpen] = useState(false);
  const [loadGraphModalOpen, setLoadGraphModalOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const [svg, setSvg] = useState("");
  const [svgSize, setSvgSize] = useState({ width: 900, height: 520 });
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [handMode, setHandMode] = useState(false);
  const [layout, setLayout] = useState<LayoutRenderer>("elk");
  const [diagramTheme, setDiagramTheme] = useState<DiagramTheme>("base");
  const [editorOpen, setEditorOpen] = useState(true);
  const [editorFullScreen, setEditorFullScreen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateTimeout, setUpdateTimeout] = useState<1 | 2 | 3>(1);
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string; x: number; y: number } | null>(null);
  const [nodeDraft, setNodeDraft] = useState({ id: "", label: "" });
  const [helpOpen, setHelpOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const renderSequenceRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const activeSnapshots = activeGraph?.snapshots ?? [];
  const canRollback = activeSnapshots.some((snapshot) => snapshot.code !== savedCode);

  // ── Multi-graph helpers ──────────────────────────────────────────────────
  const persistGraphs = (updated: GraphRecord[]) => {
    setGraphs(updated);
    saveGraphs(updated);
  };

  const switchGraph = (id: string) => {
    // Save current before switching
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: Date.now() } : g
    );
    persistGraphs(updated);
    const target = updated.find((g) => g.id === id);
    if (!target) return;
    setActiveIdState(id);
    setActiveId(id);
    setCode(target.code);
    setSavedCode(target.code);
    setMenuOpen(false);
    setLoadGraphModalOpen(false);
  };

  const handleLoadTemplate = (templateCode: string, templateName: string) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newGraph: GraphRecord = { id, name: `New ${templateName}`, code: templateCode, updatedAt: now, snapshots: [createSnapshot(templateCode, now)] };

    // Save current first
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: Date.now() } : g
    );

    const next = [...updated, newGraph];
    persistGraphs(next);
    setActiveIdState(id);
    setActiveId(id);
    setCode(templateCode);
    setSavedCode(templateCode);
    setTemplatesModalOpen(false);
    setMenuOpen(false);
    toast.success(`Loaded ${templateName} template!`);
  };

  const handleDeleteGraph = (id: string) => {
    const nextGraphs = graphs.filter((g) => g.id !== id);
    persistGraphs(nextGraphs);
    setDeletingId(null);
    toast.success("Graph deleted");

    if (id === activeId) {
      if (nextGraphs.length > 0) {
        switchGraph(nextGraphs[0].id);
      } else {
        // Create a default one if all are gone
        const newId = crypto.randomUUID();
        const now = Date.now();
        const defaultGraph = { id: newId, name: "My Graph", code: initialDiagram, updatedAt: now, snapshots: [createSnapshot(initialDiagram, now)] };
        persistGraphs([defaultGraph]);
        setActiveIdState(newId);
        setActiveId(newId);
        setCode(initialDiagram);
        setSavedCode(initialDiagram);
      }
    }
  };

  const handleSave = () => {
    const now = Date.now();
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: now, snapshots: addSnapshot(g.snapshots, code, now) } : g
    );
    persistGraphs(updated);
    setSavedCode(code);
    toast.success("Version saved");
  };

  const rollbackToSnapshot = (snapshot: GraphSnapshot) => {
    const now = Date.now();
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code: snapshot.code, updatedAt: now } : g
    );
    persistGraphs(updated);
    setCode(snapshot.code);
    setSavedCode(snapshot.code);
    setHistoryMenuOpen(false);
    setMenuOpen(false);
    toast.success("Rolled back to snapshot");
  };

  const rollbackToPreviousSnapshot = () => {
    const previousSnapshot = activeSnapshots.find((snapshot) => snapshot.code !== savedCode);
    if (!previousSnapshot) return;
    rollbackToSnapshot(previousSnapshot);
  };

  const handleNewGraph = () => {
    const name = newGraphName.trim() || "Untitled Graph";
    const id = crypto.randomUUID();
    // Save current first
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: Date.now() } : g
    );
    const now = Date.now();
    const newGraph: GraphRecord = { id, name, code: initialDiagram, updatedAt: now, snapshots: [createSnapshot(initialDiagram, now)] };
    const next = [...updated, newGraph];
    persistGraphs(next);
    setActiveIdState(id);
    setActiveId(id);
    setCode(initialDiagram);
    setSavedCode(initialDiagram);
    setNewGraphName("");
    setNewGraphModalOpen(false);
    setMenuOpen(false);
  };

  const handleExportSVG = () => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeGraph?.name || 'diagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG exported!");
    setMenuOpen(false);
  };


  const handleShare = () => {
    try {
      const compressed = LZString.compressToEncodedURIComponent(code);
      const url = new URL(window.location.href);
      url.searchParams.set("s", compressed);
      navigator.clipboard.writeText(url.toString());
      toast.success("Share link copied to clipboard (compressed)!");
      setMenuOpen(false);
    } catch (e) {
      toast.error("Failed to generate share link");
    }
  };

  const handleExportJSON = () => {
    const graph = graphs.find((g) => g.id === activeId);
    const data = { name: graph?.name ?? "graph", code, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(graph?.name ?? "graph").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const handleRename = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const updated = graphs.map((g) => (g.id === id ? { ...g, name: trimmed, updatedAt: Date.now() } : g));
    persistGraphs(updated);
    setRenamingId(null);
  };

  const startRenaming = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  // Check for shared code in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedCode = params.get("s");
    if (sharedCode) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(sharedCode);
        if (decompressed) {
          const id = crypto.randomUUID();
          const now = Date.now();
          const sharedGraph = { id, name: "Shared Graph", code: decompressed, updatedAt: now, snapshots: [createSnapshot(decompressed, now)] };
          const updated = [sharedGraph, ...graphs];
          persistGraphs(updated);
          setActiveIdState(id);
          setActiveId(id);
          setCode(decompressed);
          setSavedCode(decompressed);
          // Clean up URL without reload
          window.history.replaceState({}, document.title, window.location.pathname);
          toast.success("Imported shared graph!");
        }
      } catch (e) {
        console.error("Failed to decode shared graph", e);
        toast.error("Failed to load shared graph");
      }
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const renderDiagram = async (currentCode: string, theme: DiagramTheme, currentLayout: LayoutRenderer) => {
    const renderSequence = renderSequenceRef.current + 1;
    renderSequenceRef.current = renderSequence;
    mermaid.initialize(getMermaidConfig(theme, currentLayout));
    setIsRendering(true);
    try {
      const id = `diagram-${Date.now()}`;
      const result = await mermaid.render(id, applyLayoutToSource(currentCode, currentLayout));
      if (renderSequenceRef.current === renderSequence) {
        const prepared = prepareSvgForSharpZoom(result.svg);
        setSvg(prepared.svg);
        setSvgSize(prepared.size);
        setError("");
        setIsRendering(false);
      }
    } catch (renderError) {
      if (renderSequenceRef.current === renderSequence) {
        setError(renderError instanceof Error ? renderError.message : "Mermaid syntax error");
        setIsRendering(false);
      }
    }
  };

  useEffect(() => {
    if (!autoUpdate) return;
    const timer = window.setTimeout(() => {
      renderDiagram(code, diagramTheme, layout);
    }, updateTimeout * 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [code, diagramTheme, layout, autoUpdate, updateTimeout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;

      if (isPrimaryModifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
        return;
      }

      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setHandMode((value) => !value);
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setEditorOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const adjustZoom = (delta: number) => {
    setZoom((value) => Math.max(1, Math.round((value + delta) * 100) / 100));
  };

  const handleBoardWheel = (event: WheelEvent<HTMLDivElement>) => {
    const isPrimaryModifier = event.ctrlKey || event.metaKey;
    if (!isPrimaryModifier && !handMode) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const step = Math.max(4, zoom * 0.08);
    adjustZoom(direction * step);
  };

  const handleBoardMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('.color-picker-menu')) return;
    const isPrimaryModifier = event.ctrlKey || event.metaKey;
    if ((!isPrimaryModifier && !handMode) || event.button !== 0) return;
    event.preventDefault();
    setIsPanning(true);
    dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
  };

  const handleBoardMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    event.preventDefault();
    setPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.startX,
      y: dragRef.current.panY + event.clientY - dragRef.current.startY,
    });
  };

  const handleBoardMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!handMode) {
      const node = (event.target as Element).closest('.node');
      if (node) {
        let nodeId = node.id;
        // Strip the diagram container ID prefix if present
        nodeId = nodeId.replace(/^diagram-\d+-/, '');

        // Strip layout prefixes (flowchart- or flowchart-elk-)
        nodeId = nodeId.replace(/^flowchart-(?:elk-)?/, '');

        // Mermaid typically appends an auto-incrementing index suffix (e.g. -11)
        const suffixMatch = nodeId.match(/(.+?)-\d+$/);
        if (suffixMatch) {
          nodeId = suffixMatch[1];
        }

        const boardRect = boardRef.current?.getBoundingClientRect();
        if (boardRect) {
          setColorPickerTarget({
            id: nodeId,
            x: event.clientX - boardRect.left,
            y: event.clientY - boardRect.top,
          });
        }

        // ── Smart Navigation (Click-to-Sync) ─────────────────────────────────
        if (!editorOpen) setEditorOpen(true);

        const lines = code.split('\n');
        // Look for the node ID as a word, often followed by bracket/paren/arrow
        const nodeRegex = new RegExp(`(?:^|[\\s,;])${nodeId}(?:\\[|\\(|\\{|\\>|\\s|$)`, 'm');
        let lineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
          if (nodeRegex.test(lines[i])) {
            lineIndex = i;
            break;
          }
        }

        if (lineIndex !== -1 && textareaRef.current) {
          const textarea = textareaRef.current;
          const lineHeight = 24; // leading-6 is 24px

          // Calculate character range for highlighting
          const start = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
          const end = start + lines[lineIndex].length;

          // Scroll and highlight
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start, end);

            // center the line in the textarea
            const visibleLines = Math.floor(textarea.clientHeight / lineHeight);
            const scrollOffset = Math.max(0, (lineIndex - Math.floor(visibleLines / 2)) * lineHeight);

            textarea.scrollTo({
              top: scrollOffset,
              behavior: 'smooth'
            });
          }, 10);
        }
        return;
      }
    }

    if (!(event.target as Element).closest('.color-picker-menu')) {
      setColorPickerTarget(null);
    }
  };

  const handleBoardMouseLeave = () => {
    setIsPanning(false);
  };

  const handleClassSelect = (className: string, colorHex?: string) => {
    if (!colorPickerTarget) return;
    const { id } = colorPickerTarget;

    setCode((prevCode) => {
      let newCode = prevCode;

      if (colorHex) {
        const classDefRegex = new RegExp(`^\\s*classDef\\s+${className}\\s+.*$`, 'm');
        if (!classDefRegex.test(newCode)) {
          newCode += `\n  classDef ${className} fill:${colorHex},stroke:#00000022,stroke-width:1px`;
        }
      }

      const styleRegex = new RegExp(`^\\s*style\\s+${id}\\s+.*$`, 'gm');
      newCode = newCode.replace(styleRegex, '');

      const singleClassRegex = new RegExp(`^\\s*class\\s+${id}\\s+.*$`, 'gm');
      newCode = newCode.replace(singleClassRegex, '');

      if (className !== 'transparent') {
        newCode += `\n  class ${id} ${className}`;
      }

      return newCode.replace(/\n{3,}/g, '\n\n').trim();
    });

    setColorPickerTarget(null);
  };

  const updateNodeDetails = () => {
    if (!colorPickerTarget) return;

    const previousId = colorPickerTarget.id;
    const nextId = nodeDraft.id.trim();
    const nextLabel = nodeDraft.label.trim() || nextId;

    if (!nextId) {
      setNodeDraft((draft) => ({ ...draft, id: previousId }));
      return;
    }

    setCode((prevCode) => {
      const lines = prevCode.split('\n');
      let replacedDefinition = false;
      let idChanged = false;
      const nodeRegex = new RegExp(`(^|[\\s,;])(${escapeRegExp(previousId)})(?=$|[\\s\\[\\(\\{>])`);

      const nextLines = lines.map((line) => {
        if (replacedDefinition) return line;

        const match = nodeRegex.exec(line);
        if (!match) return line;

        const prefix = match[1];
        const nodeStart = match.index + prefix.length;
        const labelStart = nodeStart + previousId.length;
        const rest = line.slice(labelStart);
        const pair = bracketPairs.find(([open]) => rest.startsWith(open));
        replacedDefinition = true;
        idChanged = nextId !== previousId;

        if (!pair) {
          return `${line.slice(0, nodeStart)}${nextId}[${nextLabel}]${rest}`;
        }

        const [open, close] = pair;
        const contentStart = labelStart + open.length;
        const contentEnd = line.indexOf(close, contentStart);

        if (contentEnd === -1) {
          return line;
        }

        return `${line.slice(0, nodeStart)}${nextId}${open}${nextLabel}${close}${line.slice(contentEnd + close.length)}`;
      });

      let nextCode = nextLines.join('\n');

      if (idChanged) {
        nextCode = nextCode.split('\n').map((line) => {
          const styleRegex = new RegExp(`^(\\s*style\\s+)${escapeRegExp(previousId)}(?=\\s+)`);
          if (styleRegex.test(line)) {
            return line.replace(styleRegex, `$1${nextId}`);
          }

          const classMatch = line.match(/^(\s*class\s+)(.+?)(\s+[\w-]+\s*;?\s*)$/);
          if (!classMatch) return line;

          const nextNodeIds = classMatch[2]
            .split(',')
            .map((nodeId) => nodeId.trim() === previousId ? nextId : nodeId.trim())
            .join(',');
          return `${classMatch[1]}${nextNodeIds}${classMatch[3]}`;
        }).join('\n');
      }

      return nextCode;
    });

    if (nextId !== previousId) {
      setColorPickerTarget((target) => target ? { ...target, id: nextId } : target);
    }
  };

  const handleShapeSelect = (shapeType: string) => {
    if (!colorPickerTarget) return;
    const { id } = colorPickerTarget;

    const selectedShape = shapeOptions.find((shape) => shape.id === shapeType) ?? shapeOptions[0];
    const { open: newOpen, close: newClose } = selectedShape;

    setCode((prevCode) => {
      const lines = prevCode.split('\n');
      let replaced = false;
      const nodeRegex = new RegExp(`(^|[\\s,;])(${escapeRegExp(id)})(?=$|[\\s\\[\\(\\{>])`);

      const newLines = lines.map(line => {
        if (replaced) return line;

        const match = nodeRegex.exec(line);
        if (!match) return line;

        const prefix = match[1];
        const nodeId = match[2];
        const nodeStart = match.index + prefix.length;
        const labelStart = nodeStart + nodeId.length;
        const rest = line.slice(labelStart);
        const pair = bracketPairs.find(([open]) => rest.startsWith(open));

        replaced = true;

        if (!pair) {
          return `${line.slice(0, labelStart)}${newOpen}${nodeId}${newClose}${rest}`;
        }

        const [oldOpen, oldClose] = pair;
        const contentStart = labelStart + oldOpen.length;
        const contentEnd = line.indexOf(oldClose, contentStart);

        if (contentEnd === -1) {
          return line;
        }

        const text = line.slice(contentStart, contentEnd);
        const before = line.slice(0, labelStart);
        const after = line.slice(contentEnd + oldClose.length);
        return `${before}${newOpen}${text}${newClose}${after}`;
      });

      return newLines.join('\n');
    });

    setColorPickerTarget(null);
  };

  const classDefinitions = useMemo(() => {
    const classDefs: { name: string, fill: string | null }[] = [];
    const regex = /^\s*classDef\s+([\w-]+)\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const name = match[1];
      const styles = match[2];
      const fillMatch = styles.match(/fill:([^,]+)/);
      classDefs.push({
        name,
        fill: fillMatch ? fillMatch[1].trim() : null,
      });
    }
    return classDefs;
  }, [code]);

  const customClasses = useMemo(
    () => classDefinitions.filter((classDef) => !classDef.name.startsWith('color-')),
    [classDefinitions]
  );

  const selectedNodeState = useMemo(() => {
    if (!colorPickerTarget) return null;

    const { id } = colorPickerTarget;
    const nodeRegex = new RegExp(`(^|[\\s,;])(${escapeRegExp(id)})(?=$|[\\s\\[\\(\\{>])`);
    let shapeId = 'square';
    let label = id;

    for (const line of code.split('\n')) {
      const match = nodeRegex.exec(line);
      if (!match) continue;

      const nodeStart = match.index + match[1].length;
      const labelStart = nodeStart + match[2].length;
      const rest = line.slice(labelStart);
      const pair = bracketPairs.find(([open]) => rest.startsWith(open));
      const option = pair
        ? shapeOptions.find((shape) => shape.open === pair[0] && shape.close === pair[1])
        : null;
      shapeId = option?.id ?? 'square';
      if (pair) {
        const contentStart = labelStart + pair[0].length;
        const contentEnd = line.indexOf(pair[1], contentStart);
        if (contentEnd !== -1) {
          label = line.slice(contentStart, contentEnd);
        }
      }
      break;
    }

    const assignedClasses: string[] = [];
    const classLineRegex = /^\s*class\s+(.+?)\s+([\w-]+)\s*;?\s*$/gm;
    let classMatch;
    while ((classMatch = classLineRegex.exec(code)) !== null) {
      const nodeIds = classMatch[1].split(',').map((nodeId) => nodeId.trim());
      if (nodeIds.includes(id)) {
        assignedClasses.push(classMatch[2]);
      }
    }

    const colorClass = [...assignedClasses].reverse().find((className) => className.startsWith('color-'));
    const customClass = [...assignedClasses].reverse().find((className) => !className.startsWith('color-'));
    const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegExp(id)}\\s+(.+)$`, 'm');
    const styleFill = code.match(styleRegex)?.[1]?.match(/fill:([^,;]+)/)?.[1]?.trim() ?? null;
    const colorFill = styleFill ?? classDefinitions.find((classDef) => classDef.name === colorClass)?.fill ?? null;
    const customClassFill = classDefinitions.find((classDef) => classDef.name === customClass)?.fill ?? null;

    return {
      id,
      label,
      shape: shapeOptions.find((shape) => shape.id === shapeId) ?? shapeOptions[0],
      className: customClass ?? null,
      colorClass: colorClass ?? null,
      color: colorFill ?? customClassFill,
    };
  }, [classDefinitions, code, colorPickerTarget]);

  useEffect(() => {
    if (!selectedNodeState) return;
    setNodeDraft({ id: selectedNodeState.id, label: selectedNodeState.label });
  }, [selectedNodeState?.id, selectedNodeState?.label]);

  const nodeColors = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#4ade80", "#2dd4bf",
    "#38bdf8", "#818cf8", "#a78bfa", "#f472b6", "#94a3b8", "#1e293b"
  ];

  return (
    <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface text-foreground">

      {/* ── Floating Top-Right Menu ─────────────────────────────────────── */}
      {!editorFullScreen && (
        <div ref={menuRef} className="absolute top-4 right-4 z-[60]">
          {/* Toggle button */}
          <button
            id="graph-menu-toggle"
            onClick={() => { setMenuOpen((v) => !v); }}
            aria-label="Toggle graph menu"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/30 bg-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.2)] backdrop-blur-xl transition-all hover:bg-white/35 active:scale-95 dark:border-white/10 dark:bg-black/30 dark:hover:bg-black/50"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div
              className="absolute right-0 top-12 w-56 origin-top-right animate-in fade-in zoom-in-95 rounded-2xl border border-white/30 bg-white/60 shadow-[0_8px_40px_0_rgba(31,38,135,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/70"
              style={{ animationDuration: "150ms" }}
            >
              {/* Graph name header */}
              <div className="border-b border-black/5 px-4 py-3 dark:border-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/40">Active graph</p>
                {renamingId === activeId ? (
                  <input
                    autoFocus
                    className="mt-0.5 w-full bg-transparent text-sm font-semibold text-foreground outline-none border-b border-primary"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(activeId, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(activeId, renameValue);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <p
                    className="mt-0.5 truncate text-sm font-semibold text-foreground cursor-text hover:text-primary transition-colors"
                    onClick={() => startRenaming(activeId, activeGraph?.name ?? "")}
                    title="Click to rename"
                  >
                    {activeGraph?.name ?? "—"}
                  </p>
                )}
              </div>

              <div className="p-2 space-y-0.5">
                {/* Save */}
                <button
                  id="graph-menu-save"
                  onClick={handleSave}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Save className="size-4 shrink-0 text-foreground/50" />
                  Save
                </button>

                {/* History */}
                <div className="relative">
                  <button
                    id="graph-menu-history"
                    onClick={() => setHistoryMenuOpen(!historyMenuOpen)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <History className="size-4 shrink-0 text-foreground/50" />
                      <span>History</span>
                    </div>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground/50 dark:bg-white/10">{activeSnapshots.length}</span>
                      <ChevronRight className={`size-3.5 transition-transform duration-200 ${historyMenuOpen ? "rotate-90" : ""}`} />
                    </span>
                  </button>

                  {historyMenuOpen && (
                    <div className="mt-1 ml-4 max-h-56 space-y-0.5 overflow-y-auto border-l border-black/5 pl-2 pr-1 animate-in slide-in-from-top-1 dark:border-white/5">
                      {activeSnapshots.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-foreground/45">No snapshots yet</div>
                      ) : (
                        activeSnapshots.map((snapshot) => (
                          <button
                            key={snapshot.id}
                            onClick={() => rollbackToSnapshot(snapshot)}
                            disabled={snapshot.code === savedCode}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-foreground/60 transition-colors hover:bg-black/5 disabled:cursor-default disabled:opacity-50 dark:hover:bg-white/10"
                            title={snapshot.code === savedCode ? "Current saved version" : "Rollback to this snapshot"}
                          >
                            <RotateCcw className="size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{formatSnapshotTime(snapshot.createdAt)}</span>
                            {snapshot.code === savedCode && <span className="text-[9px] uppercase tracking-wider">Current</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Export Options */}
                <div className="relative">
                  <button
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <Download className="size-4 shrink-0 text-foreground/50" />
                      <span>Export As...</span>
                    </div>
                    <ChevronRight className={`size-3.5 transition-transform duration-200 ${exportMenuOpen ? "rotate-90" : ""}`} />
                  </button>

                  {exportMenuOpen && (
                    <div className="mt-1 ml-4 space-y-0.5 border-l border-black/5 pl-2 animate-in slide-in-from-top-1 dark:border-white/5">
                      <button
                        onClick={handleExportJSON}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <FileJson className="size-3.5" />
                        JSON Data
                      </button>
                      <button
                        onClick={handleExportSVG}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <FileCode className="size-3.5" />
                        SVG (Vector)
                      </button>
                    </div>
                  )}
                </div>

                {/* Templates */}
                <button
                  id="graph-menu-templates"
                  onClick={() => { setTemplatesModalOpen(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Workflow className="size-4 shrink-0 text-foreground/50" />
                  Templates
                </button>

                <div className="my-1 h-px bg-black/5 dark:bg-white/5" />

                {/* Share */}
                <button
                  id="graph-menu-share"
                  onClick={handleShare}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Share2 className="size-4 shrink-0 text-foreground/50" />
                  Share link
                </button>

                <div className="my-1 h-px bg-black/5 dark:bg-white/5" />

                {/* New */}
                <button
                  id="graph-menu-new"
                  onClick={() => { setNewGraphModalOpen(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <FilePlus className="size-4 shrink-0 text-foreground/50" />
                  New graph
                </button>

                {/* Load */}
                <button
                  id="graph-menu-load"
                  onClick={() => { setLoadGraphModalOpen(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <FolderOpen className="size-4 shrink-0 text-foreground/50" />
                  Load graph
                  <span className="ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground/50 dark:bg-white/10">{graphs.length}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {editorOpen && (
          <>
            <ResizablePanel defaultSize={36} minSize={24} maxSize={58} className="min-w-[300px]">
              <aside className={`flex flex-col border-r border-editor-line bg-editor text-editor-foreground shadow-board ${editorFullScreen ? 'absolute inset-0 z-50' : 'h-full min-h-0'}`}>
                <div className="flex h-14 items-center justify-between border-b border-editor-line bg-editor/95 px-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-editor-foreground/80">Mermaid source</div>
                    <div className="mt-0.5 text-xs text-editor-foreground/45">Live syntax preview</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!autoUpdate && (
                      <Button variant="ghost" size="icon" onClick={() => renderDiagram(code, diagramTheme, layout)} aria-label="Render diagram manually" className="text-editor-foreground/70 hover:bg-editor-line hover:text-editor-foreground">
                        <Play className="size-4" />
                      </Button>
                    )}
                    <div className="flex items-center gap-1 border-r border-editor-line pr-2 mr-1">
                      <Button variant="ghost" size="icon" onClick={() => setAutoUpdate(!autoUpdate)} aria-label={autoUpdate ? "Disable auto update" : "Enable auto update"} className={`text-editor-foreground/70 hover:bg-editor-line hover:text-editor-foreground ${autoUpdate ? 'text-primary' : ''}`}>
                        <Timer className="size-4" />
                      </Button>
                      {autoUpdate && (
                        <select
                          value={updateTimeout}
                          onChange={(e) => setUpdateTimeout(Number(e.target.value) as 1 | 2 | 3)}
                          className="h-8 bg-transparent text-xs text-editor-foreground outline-none cursor-pointer"
                        >
                          <option value={1} className="bg-editor">1s</option>
                          <option value={2} className="bg-editor">2s</option>
                          <option value={3} className="bg-editor">3s</option>
                        </select>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditorFullScreen(!editorFullScreen)} aria-label={editorFullScreen ? "Exit full screen" : "Expand to full screen"} className="text-editor-foreground/70 hover:bg-editor-line hover:text-editor-foreground">
                      {editorFullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                    </Button>
                    {!editorFullScreen && (
                      <Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)} aria-label="Collapse editor" className="text-editor-foreground/70 hover:bg-editor-line hover:text-editor-foreground">
                        <PanelLeftClose className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex min-h-0 flex-1">
                  <div className="select-none border-r border-editor-line bg-editor-line/35 px-3 py-4 text-right text-xs leading-6 text-editor-foreground/35">
                    {Array.from({ length: lineCount }, (_, index) => (
                      <div key={index}>{index + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    spellCheck={false}
                    aria-label="Mermaid code editor"
                    className="min-h-0 flex-1 resize-none bg-editor px-4 py-4 text-sm leading-6 text-editor-foreground outline-none selection:bg-primary/35 placeholder:text-editor-foreground/35"
                    style={{ tabSize: 2 }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-editor-line bg-editor/95 px-4 py-3 text-xs text-editor-foreground/65">
                  {error ? <span className="font-medium text-destructive-foreground">Syntax needs attention</span> : <span>Ready</span>}
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-editor-line px-2 py-1 text-editor-foreground/70">{lineCount} lines</span>
                    <span className="rounded-sm bg-editor-line px-2 py-1 text-editor-foreground/70">{code.length} characters</span>
                  </div>
                </div>
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={editorOpen ? 64 : 100} minSize={30}>
          <section className="relative h-full min-h-0 overflow-hidden bg-board text-board-foreground">
            {(code !== savedCode || canRollback) && (
              <div className="absolute bottom-8 right-8 z-50 flex items-center rounded-2xl border border-white/30 bg-white/20 p-2 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in fade-in zoom-in-95">
                {canRollback && (
                  <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={rollbackToPreviousSnapshot} aria-label="Rollback to previous version" title="Rollback to previous version">
                    <RotateCcw className="size-5" />
                  </Button>
                )}
                {code !== savedCode && (
                  <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={handleSave} aria-label="Save diagram" title="Unsaved changes">
                    <Save className="size-5" />
                  </Button>
                )}
              </div>
            )}

            {!editorFullScreen && (
              <div className="absolute bottom-8 left-8 z-50 flex items-center rounded-2xl border border-white/30 bg-white/20 p-2 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in fade-in zoom-in-95">
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => setHelpOpen(true)} aria-label="Open help">
                  <HelpCircle className="size-5" />
                </Button>
              </div>
            )}

            {!editorFullScreen && (
              <div className="absolute bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/30 bg-white/20 px-3 py-2 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => setEditorOpen((value) => !value)} aria-label={editorOpen ? "Collapse editor" : "Open editor"}>
                  {editorOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
                <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
                <Workflow className="size-4 text-foreground/80" />
                <select
                  value={layout}
                  onChange={(event) => setLayout(event.target.value as LayoutRenderer)}
                  aria-label="Change layout"
                  className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
                >
                  <option value="elk" className="bg-background">ELK</option>
                  <option value="dagre-wrapper" className="bg-background">Dagre</option>
                </select>
                <Palette className="size-4 text-foreground/80" />
                <select
                  value={diagramTheme}
                  onChange={(event) => setDiagramTheme(event.target.value as DiagramTheme)}
                  aria-label="Change theme"
                  className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
                >
                  <option value="base" className="bg-background">Base</option>
                  <option value="apple-glass" className="bg-background">Apple Glass</option>
                  <option value="default" className="bg-background">Default</option>
                  <option value="dark" className="bg-background">Dark</option>
                  <option value="forest" className="bg-background">Forest</option>
                  <option value="neutral" className="bg-background">Neutral</option>
                </select>
                <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
                <Button variant={handMode ? "secondary" : "ghost"} size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => setHandMode((value) => !value)} aria-label="Toggle hand move mode">
                  <Hand />
                </Button>
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => adjustZoom(-10)} aria-label="Zoom out">
                  <Minus />
                </Button>
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => adjustZoom(10)} aria-label="Zoom in">
                  <Plus />
                </Button>
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }); }} aria-label="Reset zoom and position">
                  <Focus />
                </Button>
                <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                  {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </Button>
                <span className="w-12 text-right text-xs font-medium text-foreground/80">{zoom}%</span>
              </div>
            )}

            <div
              ref={boardRef}
              onWheel={handleBoardWheel}
              onMouseDown={handleBoardMouseDown}
              onMouseMove={handleBoardMouseMove}
              onMouseUp={handleBoardMouseUp}
              onMouseLeave={handleBoardMouseLeave}
              className={`board-grid relative h-full overflow-hidden animate-grid-drift ${isPanning ? "cursor-grabbing select-none" : handMode ? "cursor-grab" : "cursor-default"}`}
            >
              {colorPickerTarget && (
                <div
                  className="color-picker-menu absolute z-50 w-52"
                  style={{
                    left: colorPickerTarget.x,
                    top: colorPickerTarget.y,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <div
                    className="flex flex-col gap-2 rounded-2xl border border-white/30 bg-white/50 p-3 shadow-[0_8px_32px_0_rgba(31,38,135,0.25)] backdrop-blur-2xl animate-in fade-in zoom-in-95 dark:border-white/10 dark:bg-black/50 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]"
                    style={{ animationDuration: "150ms" }}
                  >
                    {selectedNodeState && (
                    <div className="space-y-2 rounded-xl border border-black/5 bg-white/60 px-3 py-2 text-xs shadow-sm dark:border-white/5 dark:bg-black/40">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-foreground/45">Name</label>
                        <input
                          value={nodeDraft.id}
                          onChange={(event) => setNodeDraft((draft) => ({ ...draft, id: event.target.value }))}
                          onBlur={updateNodeDetails}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") updateNodeDetails();
                            if (event.key === "Escape") setNodeDraft({ id: selectedNodeState.id, label: selectedNodeState.label });
                          }}
                          className="h-8 w-full rounded-lg border border-black/5 bg-white/70 px-2 font-semibold text-foreground outline-none transition-colors focus:border-primary dark:border-white/5 dark:bg-black/30"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-foreground/45">Description</label>
                        <input
                          value={nodeDraft.label}
                          onChange={(event) => setNodeDraft((draft) => ({ ...draft, label: event.target.value }))}
                          onBlur={updateNodeDetails}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") updateNodeDetails();
                            if (event.key === "Escape") setNodeDraft({ id: selectedNodeState.id, label: selectedNodeState.label });
                          }}
                          className="h-8 w-full rounded-lg border border-black/5 bg-white/70 px-2 text-foreground outline-none transition-colors focus:border-primary dark:border-white/5 dark:bg-black/30"
                        />
                      </div>
                    </div>
                    )}

                    <div>
                    <div className="w-full text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Colors</div>
                    <div className="flex flex-wrap gap-1.5">
                      {nodeColors.map(color => (
                        <button
                          key={color}
                          className={`size-6 rounded-full border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm ${
                            selectedNodeState?.color?.toLowerCase() === color.toLowerCase()
                              ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : "border-black/10 dark:border-white/10"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => handleClassSelect(`color-${color.replace('#', '')}`, color)}
                          aria-label={`Select color ${color}`}
                          title={selectedNodeState?.color?.toLowerCase() === color.toLowerCase() ? "Selected color" : `Select color ${color}`}
                        />
                      ))}
                      <button
                        className={`size-6 flex items-center justify-center rounded-full border bg-white/50 dark:bg-black/50 hover:scale-110 transition-transform focus:outline-none shadow-sm ${
                          selectedNodeState && !selectedNodeState.color
                            ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : "border-black/10 dark:border-white/10"
                        }`}
                        onClick={() => handleClassSelect('transparent')}
                        aria-label="Remove style"
                        title="Remove custom style"
                      >
                        <Minus className="size-3 text-foreground/70" />
                      </button>
                    </div>
                    </div>

                    {customClasses.length > 0 && (
                    <div className="pt-2 border-t border-black/5 dark:border-white/5">
                      <div className="w-full text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Diagram Classes</div>
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {customClasses.map(cls => (
                          <button
                            key={cls.name}
                            className={`px-2 py-1 text-[11px] font-medium rounded-lg border bg-white/60 dark:bg-black/40 hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary shadow-sm flex items-center gap-1.5 ${
                              selectedNodeState?.className === cls.name
                                ? "border-primary text-primary"
                                : "border-black/5 dark:border-white/5"
                            }`}
                            onClick={() => handleClassSelect(cls.name)}
                            title={selectedNodeState?.className === cls.name ? "Selected class" : cls.name}
                          >
                            {cls.fill && (
                              <span className="size-2.5 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: cls.fill }} />
                            )}
                            {cls.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    <div className="pt-2 border-t border-black/5 dark:border-white/5">
                    <div className="w-full text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Shapes</div>
                    <div className="flex flex-wrap gap-1.5">
                      {shapeOptions.map(shape => (
                        <button
                          key={shape.id}
                          className={`group relative size-8 flex items-center justify-center rounded-lg border bg-white/60 dark:bg-black/40 hover:bg-black/5 dark:hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-primary shadow-sm ${
                            selectedNodeState?.shape.id === shape.id
                              ? "border-primary ring-2 ring-primary/50"
                              : "border-black/5 dark:border-white/5"
                          }`}
                          onClick={() => handleShapeSelect(shape.id)}
                          title={selectedNodeState?.shape.id === shape.id ? `${shape.label} selected` : shape.label}
                        >
                          <div className={`size-4 border transition-colors ${selectedNodeState?.shape.id === shape.id ? "border-primary" : "border-foreground/40 group-hover:border-primary"} ${shape.class}`} />
                        </button>
                      ))}
                    </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 animate-fade-up">
                {isRendering && (
                  <div className="absolute right-3 top-3 rounded-md border border-border bg-card/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-control backdrop-blur md:right-5 md:top-5">
                    Rendering large diagram…
                  </div>
                )}
                <div
                  className="absolute left-1/2 top-1/2 origin-center transition-[width,height,transform] duration-200 [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none [&_svg]:overflow-visible"
                  style={{
                    width: `${svgSize.width * (zoom / 100)}px`,
                    height: `${svgSize.height * (zoom / 100)}px`,
                    transform: `translate3d(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px), 0)`,
                  }}
                >
                  {error && !svg ? (
                    <pre className="max-w-[min(720px,72vw)] rounded-md border border-border bg-card/95 p-5 text-sm leading-6 text-destructive shadow-control backdrop-blur whitespace-pre-wrap">{error}</pre>
                  ) : (
                    <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                  )}
                </div>
                {error && svg && (
                  <pre className="absolute bottom-3 left-3 max-w-[min(720px,70vw)] rounded-md border border-border bg-card/95 p-4 text-xs leading-5 text-destructive shadow-control backdrop-blur whitespace-pre-wrap md:bottom-5 md:left-5">
                    {error}
                  </pre>
                )}
              </div>
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      {helpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/80">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setHelpOpen(false)}
            >
              <X className="size-5" />
            </Button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HelpCircle className="size-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Help & Shortcuts</h2>
                <p className="text-sm text-muted-foreground">Master the Mermaid Editor</p>
              </div>
            </div>

            <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2">
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shortcuts</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "Space", desc: "Toggle Hand Mode" },
                    { key: "E", desc: "Toggle Editor" },
                    { key: "Cmd/Ctrl + S", desc: "Save Diagram" },
                    { key: "Ctrl + Scroll", desc: "Zoom In/Out" },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between rounded-xl border border-black/5 bg-black/5 px-3 py-2 dark:border-white/5 dark:bg-white/5">
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                      <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm border border-border">{item.key}</kbd>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Features</h3>
                <div className="space-y-3">
                  <div className="rounded-xl border border-black/5 bg-black/5 p-3 dark:border-white/5 dark:bg-white/5">
                    <h4 className="text-sm font-medium mb-1">Custom Styling</h4>
                    <p className="text-xs text-muted-foreground">Click on any node in the diagram to open the color picker and apply custom classes.</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-black/5 p-3 dark:border-white/5 dark:bg-white/5">
                    <h4 className="text-sm font-medium mb-1">Layout & Themes</h4>
                    <p className="text-xs text-muted-foreground">Use the floating bar to switch between ELK and Dagre layouts, or choose a visual theme like Apple Glass.</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-black/5 p-3 dark:border-white/5 dark:bg-white/5">
                    <h4 className="text-sm font-medium mb-1">Auto-Update</h4>
                    <p className="text-xs text-muted-foreground">The editor renders your changes automatically. You can toggle this and adjust the delay in the editor toolbar.</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5">
              <Button className="w-full rounded-xl py-6 font-semibold" onClick={() => setHelpOpen(false)}>Got it</Button>
            </div>
          </div>
        </div>
      )}
      {newGraphModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/80">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setNewGraphModalOpen(false)}
            >
              <X className="size-5" />
            </Button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FilePlus className="size-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Create New Graph</h2>
                <p className="text-sm text-muted-foreground">Start fresh with a new diagram</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="modal-new-graph-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Graph Name</label>
                <input
                  autoFocus
                  id="modal-new-graph-name"
                  type="text"
                  placeholder="Enter a descriptive name…"
                  value={newGraphName}
                  onChange={(e) => setNewGraphName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleNewGraph(); if (e.key === "Escape") setNewGraphModalOpen(false); }}
                  className="w-full rounded-2xl border border-black/10 bg-white/50 px-4 py-3 text-sm outline-none placeholder:text-foreground/30 focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-white/5"
                />
              </div>

              <div className="pt-2">
                <Button className="w-full rounded-xl py-6 font-semibold" onClick={handleNewGraph}>Create Graph</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loadGraphModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/80">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setLoadGraphModalOpen(false)}
            >
              <X className="size-5" />
            </Button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FolderOpen className="size-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Saved Graphs</h2>
                <p className="text-sm text-muted-foreground">Continue working on your diagrams</p>
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar">
              {graphs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground italic">No saved graphs yet</div>
              ) : (
                graphs.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => switchGraph(g.id)}
                    className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all border group ${g.id === activeId
                        ? "bg-primary/10 border-primary/20 ring-1 ring-primary/20"
                        : "bg-black/5 border-transparent hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                      }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${g.id === activeId ? "bg-primary text-white" : "bg-background text-muted-foreground group-hover:text-foreground"
                      }`}>
                      <FileJson className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {renamingId === g.id ? (
                          <input
                            autoFocus
                            className="bg-transparent font-semibold truncate outline-none border-b border-primary w-full"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => handleRename(g.id, renameValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(g.id, renameValue);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                          />
                        ) : (
                          <span
                            className={`font-semibold truncate cursor-text hover:text-primary transition-colors ${g.id === activeId ? "text-primary" : "text-foreground"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenaming(g.id, g.name);
                            }}
                          >
                            {g.name}
                          </span>
                        )}
                        {g.id === activeId && renamingId !== g.id && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">Active</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Updated {new Date(g.updatedAt).toLocaleDateString()}</p>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {deletingId === g.id ? (
                        <div className="flex items-center gap-1.5 animate-in slide-in-from-right-2 fade-in">
                          <button
                            onClick={() => handleDeleteGraph(g.id)}
                            className="bg-destructive text-destructive-foreground text-[10px] font-bold uppercase px-2 py-1 rounded-lg hover:bg-destructive/90 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="bg-black/10 dark:bg-white/10 text-[10px] font-bold uppercase px-2 py-1 rounded-lg hover:bg-black/20 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(g.id)}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-xl hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete graph"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5">
              <Button className="w-full rounded-xl py-6 font-semibold" variant="outline" onClick={() => setLoadGraphModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {templatesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-black/80">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setTemplatesModalOpen(false)}
            >
              <X className="size-5" />
            </Button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Workflow className="size-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Mermaid Templates</h2>
                <p className="text-sm text-muted-foreground">Jumpstart your diagram with a preset</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleLoadTemplate(template.code, template.name)}
                  className="flex flex-col text-left p-4 rounded-2xl border border-transparent bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-foreground group-hover:text-primary transition-colors">{template.name}</span>
                    <Plus className="size-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5">
              <Button className="w-full rounded-xl py-6 font-semibold" variant="outline" onClick={() => setTemplatesModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Index;
