import React from "react";
import { useTypewriter } from "../hooks.js";
import { TEXT, PINK, PINK_BG } from "../constants.js";

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

export default function ChatMsg({ msg, animate }) {
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