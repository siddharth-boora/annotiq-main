import React, { useRef, useEffect } from "react";

// ── Session thumbnail ─────────────────────────────────────────────────────────
export default function SessionThumb({ pdfDoc }) {
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