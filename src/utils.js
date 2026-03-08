// ── Cross-span highlight engine ───────────────────────────────────────────────
export function applyHighlights(container, phrases) {
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

export function clearHighlights(container) {
  if (!container) return;
  container.querySelectorAll("mark").forEach(m => {
    const p = m.parentNode; if (!p) return;
    p.replaceChild(document.createTextNode(m.textContent), m);
    p.normalize();
  });
}