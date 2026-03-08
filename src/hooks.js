import { useState, useEffect } from "react";

// ── PDF.js ────────────────────────────────────────────────────────────────────
export function usePdfJs() {
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
export function useTypewriter(text, speed = 6, active = false) {
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