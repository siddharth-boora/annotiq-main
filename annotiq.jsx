import React, { useState, useRef, useEffect, useCallback } from "react";

// ── ChatGPT dark theme ────────────────────────────────────────────────────────
const BG     = "#212121";
const SURF   = "#171717";
const PANEL  = "#2f2f2f";
const BORDER = "#3f3f3f";
const TEXT   = "#ececec";
const MUTED  = "#8e8ea0";
const WHITE  = "#ffffff";
const PINK   = "#ff6b9d";
const PINK_BG= "rgba(255,107,157,0.18)";
const USER_BUBBLE = "#2f2f2f";
const AI_BUBBLE   = "#1a1a1a";

const CSS = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#3a3a3a; border-radius:4px; }
  ::-webkit-scrollbar-thumb:hover { background:#555; }
  * { scrollbar-width:thin; scrollbar-color:#3a3a3a transparent; }
  @keyframes spin  { to { transform:rotate(360deg); } }
  @keyframes blink { 0%,80%,100%{opacity:.15} 40%{opacity:1} }
  @keyframes fadein { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
  button, textarea, input { font-family:inherit; }

  /* PDF text layer */
  .ptl {
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    overflow:visible; user-select:text; pointer-events:auto; line-height:1;
  }
  .ptl > span {
    color:transparent !important;
    position:absolute; white-space:pre; cursor:text; transform-origin:0% 0%;
  }
  .ptl > span::selection { background:rgba(120,180,255,0.55); color:transparent; }
  .ptl > span > mark::selection { background:rgba(255,160,30,0.7); color:transparent; }
  .ptl > span > mark {
    color:transparent !important;
    background:rgba(255,107,157,0.4) !important;
    border-radius:2px;
    box-shadow:0 0 0 1.5px rgba(255,107,157,0.7);
  }
  .msg-anim { animation:fadein 0.2s ease; }
`;

// ── PDF.js ────────────────────────────────────────────────────────────────────
function usePdfJs() {
  const [lib, setLib] = useState(null);
  useEffect(() => {
    if (window.pdfjsLib) { setLib(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setLib(window.pdfjsLib);
    };
    document.head.appendChild(s);
  }, []);
  return lib;
}

// ── Typewriter ────────────────────────────────────────────────────────────────
function useTypewriter(text, speed = 6, active = false) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) { setOut(text); return; }
    setOut(""); let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) setOut(text.slice(0, ++i)); else clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [text, active]);
  return out;
}

// ── Cross-span highlight engine ───────────────────────────────────────────────
function applyHighlights(container, phrases) {
  if (!container || !phrases?.length) return;
  const spans = Array.from(container.querySelectorAll("span"));
  if (!spans.length) return;

  // Build flat string from all leaf text nodes
  const segs = [];
  let flat = "";
  for (const span of spans) {
    for (const child of Array.from(span.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent) continue;
      segs.push({ node: child, start: flat.length, end: flat.length + child.textContent.length });
      flat += child.textContent;
    }
  }
  if (!flat) return;

  const flatLo = flat.toLowerCase();
  const rawRanges = [];
  for (const phrase of phrases) {
    if (!phrase || phrase.length < 3) continue;
    const ph = phrase.toLowerCase().replace(/\s+/g, " ").trim();
    let pos = 0;
    while (pos < flatLo.length) {
      const idx = flatLo.indexOf(ph, pos);
      if (idx === -1) break;
      rawRanges.push({ from: idx, to: idx + ph.length });
      pos = idx + 1;
    }
  }
  if (!rawRanges.length) return;

  rawRanges.sort((a, b) => a.from - b.from);
  const ranges = [{ ...rawRanges[0] }];
  for (let i = 1; i < rawRanges.length; i++) {
    const last = ranges[ranges.length - 1];
    if (rawRanges[i].from <= last.to) last.to = Math.max(last.to, rawRanges[i].to);
    else ranges.push({ ...rawRanges[i] });
  }

  for (const { from, to } of ranges) {
    for (const seg of segs) {
      if (!seg.node?.parentNode) continue;
      const oStart = Math.max(from, seg.start);
      const oEnd   = Math.min(to, seg.end);
      if (oStart >= oEnd) continue;
      const localS = oStart - seg.start;
      const localE = oEnd - seg.start;
      const t      = seg.node.textContent;
      const parent = seg.node.parentNode;
      const frag   = document.createDocumentFragment();
      if (localS > 0) frag.appendChild(document.createTextNode(t.slice(0, localS)));
      const mark = document.createElement("mark");
      mark.textContent = t.slice(localS, localE);
      frag.appendChild(mark);
      if (localE < t.length) frag.appendChild(document.createTextNode(t.slice(localE)));
      parent.replaceChild(frag, seg.node);
      seg.node = null;
    }
  }
}

function clearHighlights(container) {
  if (!container) return;
  container.querySelectorAll("mark").forEach(m => {
    const p = m.parentNode; if (!p) return;
    p.replaceChild(document.createTextNode(m.textContent), m);
    p.normalize();
  });
}

// ── PdfPage ───────────────────────────────────────────────────────────────────
// scale=1 → page fills container width. scale<1 → smaller page, black space around.
// Text size proportional because the whole viewport scales together.
function PdfPage({ pdfDoc, pageNum, scale, highlights, containerWidth }) {
  const canvasRef = useRef(null);
  const textRef   = useRef(null);
  const taskRef   = useRef(null);
  const readyRef  = useRef(false);  // true once text layer is fully in DOM
  const hlRef     = useRef(highlights);

  useEffect(() => { hlRef.current = highlights; }, [highlights]);

  useEffect(() => {
    if (!pdfDoc || !containerWidth || containerWidth < 10) return;
    readyRef.current = false;
    let dead = false;

    (async () => {
      try {
        const page      = await pdfDoc.getPage(pageNum);
        if (dead) return;
        const naturalVP = page.getViewport({ scale: 1 });
        const fitScale  = (containerWidth / naturalVP.width) * scale;
        const viewport  = page.getViewport({ scale: fitScale });

        const canvas = canvasRef.current;
        const tlDiv  = textRef.current;
        if (!canvas || !tlDiv || dead) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.floor(viewport.width  * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width  = Math.floor(viewport.width)  + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (taskRef.current) { try { taskRef.current.cancel(); } catch {} }
        taskRef.current = page.render({ canvasContext: ctx, viewport });
        await taskRef.current.promise.catch(() => {});
        if (dead) return;

        tlDiv.innerHTML = "";
        tlDiv.style.width  = Math.floor(viewport.width)  + "px";
        tlDiv.style.height = Math.floor(viewport.height) + "px";

        const tc = await page.getTextContent();
        if (dead) return;

        // Wait for renderTextLayer fully — handles both promise and thenable returns
        await new Promise(res => {
          if (!window.pdfjsLib?.renderTextLayer) { res(); return; }
          const rl = window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: tlDiv, viewport, textDivs: [] });
          if (rl?.promise) rl.promise.then(res).catch(res);
          else if (typeof rl?.then === "function") rl.then(res).catch(res);
          else res();
        });
        if (dead) return;

        readyRef.current = true;
        if (hlRef.current?.length) applyHighlights(tlDiv, hlRef.current);
      } catch {}
    })();

    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageNum, scale, containerWidth]);

  // Only re-apply highlights if text layer is already ready (no render in flight)
  useEffect(() => {
    if (!textRef.current || !readyRef.current) return;
    clearHighlights(textRef.current);
    if (highlights?.length) applyHighlights(textRef.current, highlights);
  }, [highlights]);

  return (
    <div style={{
      position: "relative", marginBottom: 12,
      boxShadow: "0 4px 28px rgba(0,0,0,0.8)",
      lineHeight: 0, background: "#fff",
      display: "inline-block",  // shrinks to canvas size; pane centres it → natural black space
    }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div ref={textRef} className="ptl" />
    </div>
  );
}

// ── iMessage-style chat bubble ────────────────────────────────────────────────
function Fmt({ text }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} style={{ margin: 0, minHeight: line ? undefined : "0.7em" }}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**")
              ? <strong key={j} style={{ fontWeight: 600 }}>{chunk.slice(2, -2)}</strong>
              : chunk
          )}
        </p>
      ))}
    </>
  );
}

function ChatMsg({ msg, animate }) {
  const body   = useTypewriter(msg.text, 6, animate);
  const isUser = msg.role === "user";
  return (
    <div className="msg-anim" style={{
      padding: "18px 22px",
      background: isUser ? "transparent" : "rgba(255,255,255,0.03)",
      borderBottom: `1px solid rgba(255,255,255,0.04)`,
    }}>
      <div style={{ fontSize: 14, color: isUser ? TEXT : TEXT, lineHeight: 1.85, maxWidth: 680 }}>
        <Fmt text={animate ? body : msg.text} />
      </div>
      {!isUser && msg.sources?.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {msg.sources.map((s, i) => (
            <span key={i} style={{ background: PINK_BG, color: PINK, fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid rgba(255,107,157,0.3)` }}>
              {s.length > 52 ? s.slice(0, 52) + "…" : s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Draggable divider ─────────────────────────────────────────────────────────
function Divider({ onDrag }) {
  const dragging = useRef(false);
  const onMouseDown = useCallback(e => {
    e.preventDefault(); dragging.current = true;
    const move = ev => { if (dragging.current) onDrag(ev.clientX); };
    const up   = ()  => { dragging.current = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [onDrag]);
  return (
    <div onMouseDown={onMouseDown}
      style={{ width: 1, flexShrink: 0, cursor: "col-resize", background: BORDER, zIndex: 20, transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "#666"}
      onMouseLeave={e => e.currentTarget.style.background = BORDER}
    />
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────────
function Btn({ onClick, children, style = {}, ...rest }) {
  return (
    <button onClick={onClick} {...rest}
      style={{
        background: "none", border: `1px solid ${BORDER}`,
        color: TEXT, borderRadius: 8, padding: "5px 13px",
        fontSize: 13, cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
        display: "flex", alignItems: "center", gap: 5,
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#888"; e.currentTarget.style.color = WHITE; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT; }}
    >{children}</button>
  );
}

// ── Session thumbnail ─────────────────────────────────────────────────────────
function SessionThumb({ pdfDoc }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let dead = false;
    pdfDoc.getPage(1).then(page => {
      if (dead) return;
      // Render at decent resolution for crisp thumbnail
      const vp = page.getViewport({ scale: 1.5 });
      const c  = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width  = vp.width  * dpr;
      c.height = vp.height * dpr;
      c.style.width  = "100%";
      c.style.height = "100%";
      c.style.objectFit = "cover";
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      page.render({ canvasContext: ctx, viewport: vp });
    });
    return () => { dead = true; };
  }, [pdfDoc]);
  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Annotiq() {
  const pdfjsLib = usePdfJs();
  const [sessions,   setSessions]   = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [view,       setView]       = useState("home");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const [scale,      setScale]      = useState(1.0);
  const [activeHl,   setActiveHl]   = useState([]);
  const [input,      setInput]      = useState("");
  const [aiLoading,  setAiLoading]  = useState(false);
  const [newMsgIdx,  setNewMsgIdx]  = useState(-1);
  const [splitPct,   setSplitPct]   = useState(50);
  const [pdfPaneW,   setPdfPaneW]   = useState(0);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal,  setRenameVal]  = useState("");

  const bodyRef      = useRef(null);
  const pdfPaneRef   = useRef(null);
  const chatEndRef   = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);
  const renameRef    = useRef(null);

  const active   = sessions.find(s => s.id === activeId) || null;
  const messages = active?.messages || [];

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, aiLoading]);

  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Measure PDF pane for fit-to-width rendering
  useEffect(() => {
    const el = pdfPaneRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setPdfPaneW(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, activeId]);

  const handleDividerDrag = useCallback(clientX => {
    if (!bodyRef.current) return;
    const r   = bodyRef.current.getBoundingClientRect();
    const pct = Math.min(76, Math.max(24, ((clientX - r.left) / r.width) * 100));
    setSplitPct(pct);
  }, []);

  const updateMessages = useCallback((id, msgs) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, messages: msgs, lastOpened: Date.now() } : s));
  }, []);

  const goHome = () => { setView("home"); setActiveHl([]); };

  // ── Load PDF ────────────────────────────────────────────────────────────────
  const loadPdf = useCallback(async file => {
    if (!pdfjsLib || !file) return;
    if (file.type !== "application/pdf") { alert("Please upload a PDF."); return; }
    setLoadingPdf(true); setActiveHl([]);
    const name = file.name.replace(/\.pdf$/i, "");
    const buf  = await file.arrayBuffer();
    const doc  = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

    let full = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const ct = await pg.getTextContent();
      full += `\n\n[Page ${p}]\n` + ct.items.map(it => it.str).join(" ");
    }

    const sess = {
      id: Date.now(), name,
      pdfDoc: doc, pdfPages: doc.numPages, pdfText: full.trim(),
      lastOpened: Date.now(),
      messages: [],
    };
    setSessions(prev => [...prev, sess]);
    setActiveId(sess.id);
    setScale(1.0);
    setLoadingPdf(false); setView("reader");
  }, [pdfjsLib]);

  const handleFile = e => { loadPdf(e.target.files[0]); e.target.value = ""; };
  const handleDrop = e => { e.preventDefault(); setDragOver(false); loadPdf(e.dataTransfer.files[0]); };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || aiLoading || !active) return;
    const userMsg = { role: "user", text: input.trim(), sources: [] };
    const newMsgs = [...messages, userMsg];
    updateMessages(activeId, newMsgs);
    setInput(""); setAiLoading(true); setActiveHl([]);

    try {
      const apiMsgs = [];
      for (const m of newMsgs) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        if (apiMsgs.length === 0 && m.role === "assistant") continue;
        const last = apiMsgs[apiMsgs.length - 1];
        if (last && last.role === m.role) { last.content += "\n" + m.text; continue; }
        apiMsgs.push({ role: m.role, content: m.text });
      }
      if (!apiMsgs.length || apiMsgs[apiMsgs.length - 1].role !== "user")
        throw new Error("Conversation state error — please try again.");

      const system = `You are a research assistant for the document titled "${active.name}".
Answer using ONLY the document content. Be concise. Use **bold** for key terms.

After your answer output EXACTLY on a new line:
SOURCES: phrase one, phrase two, phrase three

Source phrase rules:
- EXACT verbatim copy from document (8-16 consecutive words)
- Character-for-character match — they will be searched in the PDF
- No quotes, comma-separated, max 4 phrases

DOCUMENT:
${active.pdfText.slice(0, 15000)}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, system, messages: apiMsgs }),
      });

      if (!res.ok) { const t = await res.text().catch(() => res.statusText); throw new Error(`API ${res.status}: ${t}`); }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      let raw = data.content?.[0]?.text?.trim() || "No response.";
      let sources = [];
      const sm = raw.match(/\n?SOURCES:\s*(.+)$/ms);
      if (sm) {
        sources = sm[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(s => s.length > 5);
        raw = raw.slice(0, sm.index).trim();
      }
      setActiveHl(sources);
      const final = [...newMsgs, { role: "assistant", text: raw, sources }];
      updateMessages(activeId, final);
      setNewMsgIdx(final.length - 1);
    } catch (err) {
      console.error("[Annotiq]", err);
      updateMessages(activeId, [...newMsgs, { role: "assistant", text: `⚠ ${err.message}`, sources: [] }]);
      setNewMsgIdx(newMsgs.length);
    }
    setAiLoading(false);
  };

  const startRename = (e, sess) => {
    e.stopPropagation();
    setRenamingId(sess.id); setRenameVal(sess.name);
  };
  const commitRename = id => {
    if (renameVal.trim()) setSessions(prev => prev.map(s => s.id === id ? { ...s, name: renameVal.trim() } : s));
    setRenamingId(null);
  };
  const fmtDate = ts => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ── HOME ────────────────────────────────────────────────────────────────────
  if (view === "home") return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <style>{CSS}</style>
      {/* Nav */}
      <div style={{ height: 52, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", padding: "0 24px", background: SURF, position: "sticky", top: 0, zIndex: 50 }}>
        <span style={{ color: WHITE, fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>annotiq</span>
      </div>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "44px 24px" }}>
        {/* Upload */}
        <div
          onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onClick={() => !loadingPdf && fileInputRef.current?.click()}
          style={{ border: `1px solid ${dragOver ? WHITE : BORDER}`, borderRadius: 14, padding: "44px 32px", textAlign: "center", cursor: loadingPdf ? "default" : "pointer", background: dragOver ? PANEL : SURF, transition: "all 0.15s", marginBottom: 44 }}
        >
          <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleFile} />
          {loadingPdf
            ? <><div style={{ fontSize: 24, color: WHITE, marginBottom: 10, animation: "spin 0.8s linear infinite", display: "inline-block" }}>⟳</div><div style={{ color: MUTED, fontSize: 14 }}>Processing PDF…</div></>
            : <><div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>↑</div>
               <div style={{ color: WHITE, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{pdfjsLib ? "Drop a PDF here, or click to browse" : "Loading engine…"}</div>
               <div style={{ color: MUTED, fontSize: 13 }}>Supports any PDF</div></>
          }
        </div>

        {/* Session grid */}
        {sessions.length > 0 && (
          <>
            <div style={{ color: WHITE, fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Recent</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,180px))", gap: 14 }}>
              {[...sessions].reverse().map(sess => (
                <div key={sess.id}
                  onClick={() => { setActiveId(sess.id); setActiveHl([]); setNewMsgIdx(-1); setView("reader"); }}
                  style={{ cursor: "pointer", borderRadius: 12, border: `1px solid ${BORDER}`, background: SURF, overflow: "hidden", transition: "border-color 0.15s, background 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#666"; e.currentTarget.style.background = PANEL; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = SURF; }}
                >
                  {/* Thumbnail */}
                  <div style={{ height: 140, background: "#1a1a1a", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${BORDER}` }}>
                    <SessionThumb pdfDoc={sess.pdfDoc} />
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    {renamingId === sess.id ? (
                      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "5px 10px", marginBottom: 2 }}
                        onClick={e => e.stopPropagation()}>
                        <input
                          ref={renameRef} value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => commitRename(sess.id)}
                          onKeyDown={e => { if (e.key === "Enter") commitRename(sess.id); if (e.key === "Escape") setRenamingId(null); }}
                          autoFocus
                          style={{ background: "none", border: "none", color: TEXT, fontSize: 13, outline: "none", width: "100%" }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{ color: TEXT, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}
                        onDoubleClick={e => startRename(e, sess)}
                        title="Double-click to rename"
                      >{sess.name}</div>
                    )}
                    <div style={{ color: MUTED, fontSize: 11 }}>{fmtDate(sess.lastOpened)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── READER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", background: BG, display: "flex", flexDirection: "column", overflow: "hidden", color: TEXT, fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <style>{CSS}</style>

      {/* Top bar */}
      <div style={{ height: 52, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px", gap: 10, borderBottom: `1px solid ${BORDER}`, background: SURF }}>
        {/* Back button — same style as other buttons */}
        <Btn onClick={goHome} style={{ padding: "5px 10px" }}>← Back</Btn>

        <span style={{ color: BORDER, fontSize: 16 }}>/</span>

        {/* Renameable title */}
        {renamingId === activeId ? (
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", minWidth: 160 }}>
            <input
              value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(activeId)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(activeId); if (e.key === "Escape") setRenamingId(null); }}
              autoFocus
              style={{ background: "none", border: "none", color: TEXT, fontSize: 13, outline: "none", width: "100%" }}
            />
          </div>
        ) : (
          <span onClick={e => startRename(e, active)} title="Click to rename"
            style={{ color: MUTED, fontSize: 13, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}
            onMouseEnter={e => e.currentTarget.style.color = TEXT}
            onMouseLeave={e => e.currentTarget.style.color = MUTED}>
            {active?.name}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Btn onClick={() => setScale(s => Math.max(0.2, +(s - 0.1).toFixed(1)))} style={{ padding: "5px 9px", fontSize: 15 }}>−</Btn>
          <span style={{ color: MUTED, fontSize: 12, minWidth: 44, textAlign: "center", userSelect: "none" }}>{Math.round(scale * 100)}%</span>
          <Btn onClick={() => setScale(s => Math.min(2.0, +(s + 0.1).toFixed(1)))} style={{ padding: "5px 9px", fontSize: 15 }}>+</Btn>
        </div>

        <Btn onClick={() => fileInputRef.current?.click()}>New PDF</Btn>
        <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* PDF + divider + Chat */}
      <div ref={bodyRef} style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* PDF pane — fit-to-width, black bg, pages centered with padding */}
        <div ref={pdfPaneRef}
          style={{ width: `${splitPct}%`, flexShrink: 0, overflow: "auto", background: "#111", padding: "24px 0 24px 0" }}>
          {/* inner wrapper centres pages when smaller than pane, allows overflow when larger */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "fit-content", margin: "0 auto", padding: "0 24px" }}>
          {activeHl.length > 0 && (
            <div style={{ background: PINK_BG, border: `1px solid rgba(255,107,157,0.35)`, borderRadius: 8, padding: "6px 14px", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "center" }}>
              <span style={{ color: PINK, fontSize: 12, fontWeight: 500 }}>✦ {activeHl.length} passage{activeHl.length !== 1 ? "s" : ""} highlighted in PDF</span>
            </div>
          )}
          {active?.pdfDoc && pdfPaneW > 0
            ? Array.from({ length: active.pdfPages }, (_, i) => (
                <PdfPage
                  key={i + 1}
                  pdfDoc={active.pdfDoc}
                  pageNum={i + 1}
                  scale={scale}
                  highlights={activeHl}
                  containerWidth={Math.max(100, pdfPaneW - 48)}
                />
              ))
            : <div style={{ color: MUTED, paddingTop: 60 }}>Loading…</div>
          }
          </div>
        </div>

        <Divider onDrag={handleDividerDrag} />

        {/* Chat pane */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: BG, minWidth: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {messages.map((msg, i) => <ChatMsg key={i} msg={msg} animate={i === newMsgIdx} />)}
            {aiLoading && (
              <div className="msg-anim" style={{ padding: "18px 22px", borderBottom: `1px solid rgba(255,255,255,0.04)`, background: "rgba(255,255,255,0.03)", display: "flex", gap: 5, alignItems: "center" }}>
                {[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: MUTED, animation: `blink 1.2s ${j*0.22}s ease-in-out infinite` }} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Empty state + suggestion chips */}
          {messages.length === 0 && !aiLoading && (
            <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 22px 12px", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: PANEL, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📄</div>
              <div style={{ color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>Ask anything about this document</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
                {["What is this about?", "Key findings?", "What methodology?", "Summarize conclusions"].map(p => (
                  <button key={p} onClick={() => setInput(p)}
                    style={{ background: "none", border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12, padding: "5px 13px", borderRadius: 999, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#888"; e.currentTarget.style.color = TEXT; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}>{p}</button>
                ))}
              </div>
            </div>
          )}

          {/* Input — send button lives inside the box */}
          <div style={{ padding: "8px 16px 16px", flexShrink: 0, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 22, padding: "9px 12px 9px 16px", transition: "border-color 0.15s", display: "flex", alignItems: "flex-end", gap: 8 }}
              onFocusCapture={e => e.currentTarget.style.borderColor = "#777"}
              onBlurCapture={e  => e.currentTarget.style.borderColor = BORDER}>
              <textarea
                ref={textareaRef} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask anything about this document…"
                rows={1}
                style={{ flex: 1, background: "none", border: "none", color: TEXT, fontSize: 14, resize: "none", outline: "none", lineHeight: 1.6, maxHeight: 160, overflow: "auto", padding: 0, textAlign: "left" }}
              />
              <button onClick={handleSend} disabled={aiLoading || !input.trim()}
                style={{
                  background: !aiLoading && input.trim() ? WHITE : "#3a3a3a",
                  border: "none",
                  color: !aiLoading && input.trim() ? BG : MUTED,
                  borderRadius: "50%", width: 30, height: 30, flexShrink: 0,
                  cursor: !aiLoading && input.trim() ? "pointer" : "default",
                  fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>↑</button>
            </div>
            <div style={{ textAlign: "center", color: "#444", fontSize: 11, marginTop: 7 }}>
              Powered by Claude
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
