import React, { useCallback, useRef } from "react";
import { BORDER } from "../constants.js";

// ── Draggable divider ─────────────────────────────────────────────────────────
export default function Divider({ onDrag }) {
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