import React from "react";
import { BORDER, TEXT, WHITE } from "../constants.js";

// ── Btn ───────────────────────────────────────────────────────────────────────
export default function Btn({ onClick, children, style = {}, ...rest }) {
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