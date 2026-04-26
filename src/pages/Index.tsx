import { type MouseEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { Focus, Hand, Minus, Moon, Palette, PanelLeftClose, PanelLeftOpen, Plus, Sun, Workflow, Maximize, Minimize, Play, Timer, Save } from "lucide-react";
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
  const [code, setCode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mermaidCode") || initialDiagram;
    }
    return initialDiagram;
  });
  const [savedCode, setSavedCode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mermaidCode") || initialDiagram;
    }
    return initialDiagram;
  });
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
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const renderSequenceRef = useRef(0);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  const handleSave = () => {
    localStorage.setItem("mermaidCode", code);
    setSavedCode(code);
  };

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
                  <span className="rounded-sm bg-editor-line px-2 py-1 text-editor-foreground/70">{lineCount} lines</span>
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
    </main>
  );
};

export default Index;