import React, { useState, useRef, useEffect, useCallback } from "react";
import { BG, SURF, PANEL, BORDER, TEXT, MUTED, WHITE, PINK, PINK_BG, CSS } from "./constants.js";
import { usePdfJs } from "./hooks.js";
import PdfPage from "./components/PdfPage.jsx";
import ChatMsg from "./components/ChatMsg.jsx";
import Divider from "./components/Divider.jsx";
import Btn from "./components/Btn.jsx";
import SessionThumb from "./components/SessionThumb.jsx";

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