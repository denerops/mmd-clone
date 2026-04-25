import { type MouseEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { Download, Focus, Minus, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { toast } from "sonner";

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
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgElement.setAttribute("shape-rendering", "geometricPrecision");
  svgElement.setAttribute("text-rendering", "geometricPrecision");

  return { svg: svgElement.outerHTML, size: { width, height } };
};

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: {
    primaryColor: "#ccfbf1",
    primaryTextColor: "#102027",
    primaryBorderColor: "#14b8a6",
    lineColor: "#475569",
    secondaryColor: "#eef2ff",
    tertiaryColor: "#f8fafc",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
});

const Index = () => {
  const [code, setCode] = useState(initialDiagram);
  const [svg, setSvg] = useState("");
  const [svgSize, setSvgSize] = useState({ width: 900, height: 520 });
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [renderKey, setRenderKey] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const id = `diagram-${Date.now()}`;
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          const prepared = prepareSvgForSharpZoom(result.svg);
          setSvg(prepared.svg);
          setSvgSize(prepared.size);
          setError("");
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Mermaid syntax error");
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, renderKey]);

  const exportSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "diagram.svg";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("SVG exported in high resolution");
  };

  const adjustZoom = (delta: number) => {
    setZoom((value) => Math.max(1, Math.round((value + delta) * 100) / 100));
  };

  const handleBoardWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const step = Math.max(4, zoom * 0.08);
    adjustZoom(direction * step);
  };

  const handleBoardMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.button !== 0) return;
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

  const stopPanning = () => setIsPanning(false);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border/80 bg-card/80 px-3 shadow-control backdrop-blur md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-primary-foreground shadow-control">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-normal md:text-lg">Mermaid Studio</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Live Mermaid language editor</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => setEditorOpen((value) => !value)} aria-label="Toggle editor">
            {editorOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRenderKey((value) => value + 1)}>
            <RotateCcw />
            <span className="hidden sm:inline">Render</span>
          </Button>
          <Button size="sm" onClick={exportSvg} disabled={!svg}>
            <Download />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {editorOpen && (
          <>
            <ResizablePanel defaultSize={36} minSize={24} maxSize={58} className="min-w-[280px]">
              <aside className="flex h-full min-h-0 flex-col bg-editor text-editor-foreground">
                <div className="flex h-11 items-center justify-between border-b border-editor-line px-4">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-editor-foreground/70">Code</span>
                  <span className="rounded-sm bg-editor-line px-2 py-1 text-xs text-editor-foreground/70">{lineCount} lines</span>
                </div>
                <textarea
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  spellCheck={false}
                  aria-label="Mermaid code editor"
                  className="min-h-0 flex-1 resize-none bg-editor p-4 text-sm leading-6 text-editor-foreground outline-none selection:bg-primary/35"
                />
                <div className="border-t border-editor-line px-4 py-3 text-xs text-editor-foreground/65">
                  {error ? <span className="text-destructive-foreground">Syntax needs attention</span> : <span>Compatible with Mermaid diagrams</span>}
                </div>
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={64} minSize={30}>
        <section className="relative h-full min-h-0 overflow-hidden bg-board text-board-foreground">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/90 px-2 py-1.5 shadow-control backdrop-blur md:left-5 md:top-5">
            <Button variant="ghost" size="icon" onClick={() => adjustZoom(-10)} aria-label="Zoom out">
              <Minus />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => adjustZoom(10)} aria-label="Zoom in">
              <Plus />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }); }} aria-label="Reset zoom and position">
              <Focus />
            </Button>
            <span className="w-12 text-right text-xs font-medium text-muted-foreground">{zoom}%</span>
          </div>

          <div
            ref={boardRef}
            onWheel={handleBoardWheel}
            onMouseDown={handleBoardMouseDown}
            onMouseMove={handleBoardMouseMove}
            onMouseUp={stopPanning}
            onMouseLeave={stopPanning}
            className={`board-grid h-full overflow-hidden p-6 pt-24 animate-grid-drift md:p-10 md:pt-28 ${isPanning ? "cursor-grabbing select-none" : "cursor-default"}`}
          >
            <div className="flex min-h-full min-w-full items-center justify-center animate-fade-up">
              <div
                className="origin-center transition-[width,height,transform] duration-200 [&_svg]:overflow-visible"
                style={{
                  width: `${svgSize.width * (zoom / 100)}px`,
                  height: `${svgSize.height * (zoom / 100)}px`,
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
                }}
              >
                {error ? (
                  <pre className="max-w-[min(720px,72vw)] rounded-md border border-border bg-card/95 p-5 text-sm leading-6 text-destructive shadow-control backdrop-blur whitespace-pre-wrap">{error}</pre>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: svg }} />
                )}
              </div>
            </div>
          </div>
        </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
};

export default Index;