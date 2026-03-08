// ── ChatGPT dark theme ────────────────────────────────────────────────────────
export const BG     = "#212121";
export const SURF   = "#171717";
export const PANEL  = "#2f2f2f";
export const BORDER = "#3f3f3f";
export const TEXT   = "#ececec";
export const MUTED  = "#8e8ea0";
export const WHITE  = "#ffffff";
export const PINK   = "#ff6b9d";
export const PINK_BG= "rgba(255,107,157,0.18)";
export const USER_BUBBLE = "#2f2f2f";
export const AI_BUBBLE   = "#1a1a1a";

export const CSS = `
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