// "Pick numbers on this page". Added to the page only when you choose it in
// the popup. Hover to highlight, click a number to add it, then Save.
// Nothing is saved until you press Save.

(() => {
  if (window.__profileSyncPicker) return;
  window.__profileSyncPicker = true;

  const picked = []; // { label, selector, el }
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: 0 0 auto 0;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .bar { font: 14px/1.4 system-ui, sans-serif; background: #1a1b26; color: #c0caf5; border-bottom: 2px solid #7aa2f7;
             padding: 10px 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; box-shadow: 0 4px 16px #0006; }
      b { color: #7aa2f7; }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
      .chip { background: #292e42; border-radius: 999px; padding: 2px 10px; font-size: 13px; white-space: nowrap; }
      .chip button { background: none; border: 0; color: #f7768e; cursor: pointer; padding: 0 0 0 6px; font: inherit; }
      input { background: #16161e; color: #c0caf5; border: 1px solid #2f334d; border-radius: 6px; padding: 5px 8px; font: inherit; width: 170px; }
      .btn { border: 1px solid #2f334d; background: #1f2335; color: #c0caf5; border-radius: 6px; padding: 5px 12px; cursor: pointer; font: inherit; }
      .save { background: #7aa2f7; border-color: #7aa2f7; color: #1a1b26; font-weight: 600; }
      .save:disabled { opacity: .5; cursor: default; }
      .box { position: fixed; pointer-events: none; border: 2px solid #9ece6a; background: #9ece6a22; border-radius: 4px; display: none; }
      .mark { position: fixed; pointer-events: none; border: 2px solid #7aa2f7; border-radius: 4px; }
    </style>
    <div class="bar">
      <span><b>Profile Sync:</b> click the numbers you want to track.</span>
      <div class="chips"></div>
      <input class="name" placeholder="Name, e.g. picoCTF" maxlength="40">
      <button class="btn save" disabled>Save</button>
      <button class="btn cancel">Cancel</button>
    </div>
    <div class="box"></div>`;
  document.documentElement.append(host);
  const $ = (s) => root.querySelector(s);
  $(".name").value = document.title.split(/[|\-–·]/)[0].trim().slice(0, 40) || location.hostname;

  // A CSS selector that finds this element again next time
  function selectorFor(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id) && document.querySelectorAll(`#${node.id}`).length === 1) {
        parts.unshift(`#${node.id}`);
        break;
      }
      const test = node.getAttribute("data-testid");
      if (test && /^[\w-]+$/.test(test)) {
        parts.unshift(`[data-testid="${test}"]`);
        if (document.querySelectorAll(parts.join(" > ")).length === 1) break;
        continue;
      }
      const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
      parts.unshift(same.length > 1 ? `${node.tagName.toLowerCase()}:nth-of-type(${same.indexOf(node) + 1})` : node.tagName.toLowerCase());
    }
    return parts.join(" > ");
  }

  // A label guess: the text just before the number, e.g. "Solved"
  function guessLabel(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const text = (node.parentElement?.innerText || "").replace(/\s+/g, " ").trim();
      const own = (el.innerText || "").trim();
      const words = text.replace(own, "").replace(/[\d,.%#:+]+/g, " ").trim().split(" ").filter(Boolean);
      if (words.length) return words.slice(0, 3).join(" ").slice(0, 30);
    }
    return "";
  }

  const box = $(".box");
  function place(div, el) {
    const r = el.getBoundingClientRect();
    Object.assign(div.style, { display: "block", left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
  }

  function render() {
    const chips = $(".chips");
    chips.replaceChildren();
    picked.forEach((p, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${p.label}: ${(p.el.innerText || "").trim().slice(0, 20)}`;
      const x = document.createElement("button");
      x.textContent = "×";
      x.title = "Remove";
      x.onclick = () => {
        p.mark.remove();
        picked.splice(i, 1);
        render();
      };
      chip.append(x);
      chips.append(chip);
    });
    $(".save").disabled = !picked.length;
    picked.forEach((p) => place(p.mark, p.el));
  }

  const inside = (e) => e.composedPath().includes(host);
  function over(e) {
    if (inside(e)) return (box.style.display = "none");
    place(box, e.target);
  }
  function click(e) {
    if (inside(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (!(el.innerText || "").trim() || picked.some((p) => p.el === el) || picked.length >= 12) return;
    const label = prompt("Name this number (e.g. Solved, Rank, Points):", guessLabel(el));
    if (!label) return;
    const mark = document.createElement("div");
    mark.className = "mark";
    root.append(mark);
    // plain numbers ("1,234", "#56", "78%") are tracked as numbers, anything else ("12th", "Top 5%") as text
    const text = (el.innerText || "").trim();
    const kind = /^[#+]?\s*-?[\d][\d,.\s']*\s*%?$/.test(text) ? "number" : "text";
    picked.push({ label: label.trim().slice(0, 40), selector: selectorFor(el), kind, el, mark });
    render();
  }
  function close() {
    document.removeEventListener("mouseover", over, true);
    document.removeEventListener("click", click, true);
    window.removeEventListener("scroll", render, true);
    host.remove();
    window.__profileSyncPicker = false;
  }

  document.addEventListener("mouseover", over, true);
  document.addEventListener("click", click, true);
  window.addEventListener("scroll", render, true);
  $(".cancel").onclick = close;
  $(".save").onclick = async () => {
    const msg = { type: "picked", name: $(".name").value.trim(), fields: picked.map(({ label, selector, kind }) => ({ label, selector, kind })) };
    $(".save").disabled = true;
    $(".save").textContent = "Saving…";
    const r = await chrome.runtime.sendMessage(msg);
    close();
    if (!r?.ok) alert(`Profile Sync: ${r?.error || "couldn't save"}`);
  };
})();
