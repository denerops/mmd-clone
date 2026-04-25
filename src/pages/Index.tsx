import { useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { Download, Focus, Minus, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [editorOpen, setEditorOpen] = useState(true);
  const [renderKey, setRenderKey] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const id = `diagram-${Date.now()}`;
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(result.svg);
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

  return (
    <main className="min-h-screen overflow-hidden bg-surface text-foreground">
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

      <section className="grid h-[calc(100vh-3.5rem)] grid-cols-1 md:grid-cols-[minmax(320px,38vw)_1fr]">
        {editorOpen && (
          <aside className="flex min-h-0 flex-col border-b border-border bg-editor text-editor-foreground md:border-b-0 md:border-r">
            <div className="flex h-11 items-center justify-between border-b border-editor-line px-4">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-editor-foreground/70">Code</span>
              <span className="rounded-sm bg-editor-line px-2 py-1 text-xs text-editor-foreground/70">{lineCount} lines</span>
            </div>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              aria-label="Mermaid code editor"
              className="min-h-[38vh] flex-1 resize-none bg-editor p-4 text-sm leading-6 text-editor-foreground outline-none selection:bg-primary/35 md:min-h-0"
            />
            <div className="border-t border-editor-line px-4 py-3 text-xs text-editor-foreground/65">
              {error ? <span className="text-destructive-foreground">Syntax needs attention</span> : <span>Compatible with Mermaid diagrams</span>}
            </div>
          </aside>
        )}

        <section className="relative min-h-0 overflow-hidden bg-board text-board-foreground">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/90 px-2 py-1.5 shadow-control backdrop-blur md:left-5 md:top-5">
            <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.max(25, value - 10))} aria-label="Zoom out">
              <Minus />
            </Button>
            <Slider value={[zoom]} min={25} max={220} step={5} onValueChange={([value]) => setZoom(value)} className="w-28 md:w-40" />
            <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.min(220, value + 10))} aria-label="Zoom in">
              <Plus />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setZoom(100)} aria-label="Reset zoom">
              <Focus />
            </Button>
            <span className="w-12 text-right text-xs font-medium text-muted-foreground">{zoom}%</span>
          </div>

          <div ref={boardRef} className="board-grid h-full overflow-auto p-8 pt-24 shadow-board animate-grid-drift md:p-12 md:pt-28">
            <div className="mx-auto flex min-h-full w-max min-w-full items-center justify-center animate-fade-up">
              <div
                className="origin-center rounded-md border border-border bg-card p-6 shadow-board transition-transform duration-200 md:p-8"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                {error ? (
                  <pre className="max-w-[min(720px,72vw)] whitespace-pre-wrap text-sm leading-6 text-destructive">{error}</pre>
                ) : (
                  <div className="max-w-none [&_svg]:h-auto [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: svg }} />
                )}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
};

export default Index;