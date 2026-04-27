import { type MouseEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { Download, FileJson, FolderOpen, Focus, Hand, HelpCircle, Menu, Minus, Moon, Palette, PanelLeftClose, PanelLeftOpen, Plus, Sun, Workflow, Maximize, Minimize, Play, Timer, Save, X, FilePlus, Share2 } from "lucide-react";
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

  classDef focus fill:#14b8a6,stroke:#0f766e,color:#ffffff
  classDef calm fill:#eef2ff,stroke:#6366f1,color:#111827
  class A,E focus
  class B,C,D,F calm`;

// ─── Multi-graph persistence helpers ────────────────────────────────────────
const GRAPHS_KEY = "mmd-graphs";
const ACTIVE_KEY = "mmd-active-graph";

type GraphRecord = { id: string; name: string; code: string; updatedAt: number };

const loadGraphs = (): GraphRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(GRAPHS_KEY) || "[]");
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
    graphs = [{ id, name: "My Graph", code: legacy, updatedAt: Date.now() }];
    saveGraphs(graphs);
    setActiveId(id);
    activeId = id;
    localStorage.removeItem("mermaidCode");
  } else if (graphs.length === 0) {
    const id = crypto.randomUUID();
    graphs = [{ id, name: "My Graph", code: initialDiagram, updatedAt: Date.now() }];
    saveGraphs(graphs);
    setActiveId(id);
    activeId = id;
  } else if (!activeId || !graphs.find((g) => g.id === activeId)) {
    activeId = graphs[0].id;
    setActiveId(activeId);
  }

  return { graphs, activeId };
};

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
  const [renamingId, setRenamingId] = useState<string | null>(null);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const renderSequenceRef = useRef(0);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

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

  const handleSave = () => {
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: Date.now() } : g
    );
    persistGraphs(updated);
    setSavedCode(code);
  };

  const handleNewGraph = () => {
    const name = newGraphName.trim() || "Untitled Graph";
    const id = crypto.randomUUID();
    // Save current first
    const updated = graphs.map((g) =>
      g.id === activeId ? { ...g, code, updatedAt: Date.now() } : g
    );
    const newGraph: GraphRecord = { id, name, code: initialDiagram, updatedAt: Date.now() };
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

  const handleShare = () => {
    try {
      const compressed = LZString.compressToEncodedURIComponent(code);
      const url = new URL(window.location.href);
      url.searchParams.set("s", compressed); // Using 's' for short/shared
      navigator.clipboard.writeText(url.toString());
      toast.success("Share link copied to clipboard (compressed)!");
      setMenuOpen(false);
    } catch (e) {
      toast.error("Failed to generate share link");
    }
  };

  const handleExport = () => {
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
          const sharedGraph = { id, name: "Shared Graph", code: decompressed, updatedAt: Date.now() };
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

  const customClasses = useMemo(() => {
    const classDefs: { name: string, fill: string | null }[] = [];
    const regex = /^\s*classDef\s+([\w-]+)\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const name = match[1];
      if (name.startsWith('color-')) continue;
      const styles = match[2];
      const fillMatch = styles.match(/fill:([^,]+)/);
      classDefs.push({
        name,
        fill: fillMatch ? fillMatch[1].trim() : null,
      });
    }
    return classDefs;
  }, [code]);

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

                {/* Export */}
                <button
                  id="graph-menu-export"
                  onClick={handleExport}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Download className="size-4 shrink-0 text-foreground/50" />
                  Export as JSON
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
            {code !== savedCode && (
              <div className="absolute bottom-8 right-8 z-50 flex items-center rounded-2xl border border-white/30 bg-white/20 p-2 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in fade-in zoom-in-95">
                <Button variant="ghost" size="icon" className="hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-colors" onClick={handleSave} aria-label="Save diagram" title="Unsaved changes">
                  <Save className="size-5" />
                </Button>
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
                  className="color-picker-menu absolute z-50 flex flex-col gap-2 w-52 p-3 rounded-2xl border border-white/30 bg-white/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/50 dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] transition-all animate-in zoom-in-95"
                  style={{ left: Math.min(colorPickerTarget.x + 10, (boardRef.current?.clientWidth || 500) - 200), top: Math.min(colorPickerTarget.y + 10, (boardRef.current?.clientHeight || 500) - 150) }}
                >
                  <div>
                    <div className="w-full text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Colors</div>
                    <div className="flex flex-wrap gap-1.5">
                      {nodeColors.map(color => (
                        <button
                          key={color}
                          className="size-6 rounded-full border border-black/10 dark:border-white/10 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                          style={{ backgroundColor: color }}
                          onClick={() => handleClassSelect(`color-${color.replace('#', '')}`, color)}
                          aria-label={`Select color ${color}`}
                        />
                      ))}
                      <button
                        className="size-6 flex items-center justify-center rounded-full border border-black/10 bg-white/50 dark:border-white/10 dark:bg-black/50 hover:scale-110 transition-transform focus:outline-none shadow-sm"
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
                      <div className="flex flex-wrap gap-1.5">
                        {customClasses.map(cls => (
                          <button
                            key={cls.name}
                            className="px-2 py-1 text-[11px] font-medium rounded-lg border border-black/5 bg-white/60 dark:border-white/5 dark:bg-black/40 hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary shadow-sm flex items-center gap-1.5"
                            onClick={() => handleClassSelect(cls.name)}
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
                    className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all border group ${
                      g.id === activeId 
                        ? "bg-primary/10 border-primary/20 ring-1 ring-primary/20" 
                        : "bg-black/5 border-transparent hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      g.id === activeId ? "bg-primary text-white" : "bg-background text-muted-foreground group-hover:text-foreground"
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
    </main>
  );
};

export default Index;