import React, { useRef, useEffect } from "react";
import { applyHighlights, clearHighlights } from "../utils.js";

// ── PdfPage ───────────────────────────────────────────────────────────────────
// scale=1 → page fills container width. scale<1 → smaller page, black space around.
// Text size proportional because the whole viewport scales together.
export default function PdfPage({ pdfDoc, pageNum, scale, highlights, containerWidth }) {
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
      lineHeight: 0, background: "transparent",
      display: "inline-block",  // shrinks to canvas size; pane centres it → natural black space
    }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div ref={textRef} className="ptl" />
    </div>
  );
}