/* Muni Underwriting Fee Map — static, no map server. */
(function () {
  "use strict";

  const FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
    "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
    "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
    "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY", "72": "PR"
  };
  const KIND_LABEL = { state: "State", city: "City", issuer: "Other issuer" };

  // Bins for the choropleth (six blue steps, light = low).
  const BINS = {
    fee: { edges: [250e3, 1e6, 2.5e6, 5e6, 10e6], ticks: ["", "250K", "1M", "2.5M", "5M", "10M"] },
    rate: { edges: [1, 2, 3, 4, 5], ticks: ["", "$1", "$2", "$3", "$4", "$5"] }
  };
  const SEQ = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

  // Zoomed "New York City area" box. Coordinates are in the main map's viewBox units.
  const INSET = {
    frame: { x: 890, y: 226, w: 212, h: 212 },       // the box drawn on the map
    region: { x: 860, y: 207, w: 19, h: 17 },    // the patch of the main map it magnifies
    title: "New York City area"
  };
  const SHORT = {
    "city-new-york-ny": "NYC", "issuer-ny-mta": "MTA", "issuer-port-authority-nynj": "Port Authority",
    "issuer-nyc-tfa": "NYC TFA", "issuer-nj-turnpike": "NJ Turnpike", "issuer-jfk-new-terminal-one": "JFK Terminal One"
  };

  const svgNS = "http://www.w3.org/2000/svg";
  const $ = (s) => document.querySelector(s);
  const state = { metric: "fee", selected: null, sort: { key: "underwriter_discount", dir: -1 } };
  let records = [];
  let byId = new Map();

  const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
  const path = d3.geoPath();

  // ---------- formatting ----------
  function money(v) {
    if (v == null || isNaN(v)) return null;
    const a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + Math.round(v);
  }
  function moneyFull(v) { return v == null ? null : "$" + Math.round(v).toLocaleString("en-US"); }
  function rateText(r) { return r == null ? null : "$" + r.toFixed(2); }
  function dateText(d) {
    if (!d) return null;
    const t = new Date(d + "T12:00:00");
    return isNaN(t) ? d : t.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
  function metricValue(r) { return state.metric === "fee" ? r.underwriter_discount : r.rate; }
  function metricText(r) {
    return state.metric === "fee" ? money(r.underwriter_discount) : (r.rate == null ? null : rateText(r.rate) + " per $1,000");
  }
  function binIndex(v) {
    const e = BINS[state.metric].edges;
    let i = 0;
    while (i < e.length && v >= e[i]) i++;
    return i;
  }

  // ---------- map ----------
  function el(tag, attrs) {
    const n = document.createElementNS(svgNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function drawMap(us) {
    const svg = $("#map");
    const gStates = el("g", { id: "states" });
    const gDots = el("g", { id: "dots" });
    svg.append(gStates, gDots);

    const features = topojson.feature(us, us.objects.states).features;
    for (const f of features) {
      const code = FIPS[f.id];
      // stroke/fill set inline too: the zoomed NYC box re-uses these paths via <use>,
      // where page CSS selectors don't reach
      const p = el("path", { d: path(f), class: "state", "data-code": code, stroke: "var(--state-stroke)", "stroke-width": 0.8, "vector-effect": "non-scaling-stroke" });
      p.__code = code;
      p.__name = f.properties.name;
      gStates.append(p);
    }
    const borders = el("path", {
      d: path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)),
      fill: "none", stroke: "var(--state-stroke)", "stroke-width": 0.6, "pointer-events": "none", "vector-effect": "non-scaling-stroke"
    });
    gStates.append(borders);

    for (const r of records.filter((r) => r.kind !== "state" && r.lat != null && r.lon != null)) {
      const xy = projection([r.lon, r.lat]);
      if (!xy) continue;
      const shape = r.kind === "issuer"
        ? el("rect", { class: "dot issuer", "data-id": r.id })
        : el("circle", { class: "dot city", "data-id": r.id, cx: xy[0], cy: xy[1] });
      shape.__xy = xy;
      shape.__rec = r;
      gDots.append(shape);
    }
    drawInset(svg, gDots);

    svg.addEventListener("mousemove", onHover);
    svg.addEventListener("mouseleave", () => ($("#tooltip").hidden = true));
    svg.addEventListener("click", onClick);
  }

  // ---------- NYC inset ----------
  function insetTitleH() { return 22; }
  function regionToFrame([x, y]) {
    const { frame: f, region: g } = INSET;
    const k = Math.min(f.w / g.w, (f.h - insetTitleH()) / g.h);
    const ox = f.x + (f.w - g.w * k) / 2, oy = f.y + insetTitleH() + (f.h - insetTitleH() - g.h * k) / 2;
    return [ox + (x - g.x) * k, oy + (y - g.y) * k];
  }

  function drawInset(svg, gDots) {
    const { frame: f, region: g } = INSET;
    const inRegion = Array.from(gDots.children).filter((d) => {
      const [x, y] = d.__xy;
      return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
    });
    if (!inRegion.length) return;

    const root = el("g", { id: "inset" });
    // outline of the magnified patch on the main map + connector to the box
    root.append(
      el("rect", { class: "inset-src", x: g.x, y: g.y, width: g.w, height: g.h }),
      el("line", { class: "inset-link", x1: g.x + g.w, y1: g.y + g.h / 2, x2: f.x, y2: f.y + f.h / 2 }),
      el("rect", { class: "inset-frame", x: f.x, y: f.y, width: f.w, height: f.h, rx: 6 })
    );
    const title = el("text", { class: "inset-title", x: f.x + 8, y: f.y + 15 });
    title.textContent = INSET.title;
    root.append(title);

    // the magnified map: re-use the state shapes through a zoomed nested <svg>
    const [ax, ay] = regionToFrame([g.x, g.y]);
    const [bx, by] = regionToFrame([g.x + g.w, g.y + g.h]);
    const view = el("svg", { x: ax, y: ay, width: bx - ax, height: by - ay, viewBox: `${g.x} ${g.y} ${g.w} ${g.h}`, "pointer-events": "none" });
    view.append(el("use", { href: "#states" }));
    root.append(view);

    const gLinks = el("g", { class: "inset-links" });
    const gMarks = el("g", { class: "inset-marks" });
    root.append(gLinks, gMarks);
    for (const src of inRegion) {
      const r = src.__rec;
      const home = regionToFrame(src.__xy);
      const pin = el("circle", { class: "inset-pin", cx: home[0], cy: home[1], r: 1.6 });
      const leader = el("line", { class: "inset-leader", x1: home[0], y1: home[1] });
      const mark = el(src.tagName, { class: src.getAttribute("class") + " inset-dot", "data-id": r.id });
      const label = el("text", { class: "inset-label", "text-anchor": "middle" });
      label.textContent = SHORT[r.id] || r.name.replace(/\s*\(.*$/, "");
      Object.assign(mark, { __rec: r, __home: home, __pin: pin, __leader: leader, __label: label });
      gLinks.append(leader, pin);
      gMarks.append(mark, label);
    }
    svg.append(root);
  }

  // Spread the inset markers apart (their real positions are often a few hundred
  // metres from each other) and keep them, with labels, inside the box.
  function layoutInset() {
    const marks = Array.from(document.querySelectorAll("#inset .inset-dot")).filter((m) => !m.classList.contains("hidden"));
    const { frame: f } = INSET;
    const pad = 4, top = f.y + insetTitleH(), labelH = 11;
    const nodes = marks.map((m, i) => {
      const lw = m.__label.textContent.length * 5.2;
      const w = Math.max(m.__r * 2.5, lw) + pad, h = m.__r * 2.5 + labelH + pad;
      // tiny deterministic nudge so identical positions can separate
      return { m, w, h, x: m.__home[0] + Math.cos(i * 2.4) * 0.5, y: m.__home[1] + Math.sin(i * 2.4) * 0.5 };
    });
    for (let it = 0; it < 300; it++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) { const s = (a.x < b.x ? -1 : 1) * ox / 2; a.x += s; b.x -= s; }
        else { const s = (a.y < b.y ? -1 : 1) * oy / 2; a.y += s; b.y -= s; }
      }
      for (const n of nodes) {   // gentle pull home, then clamp inside the box
        n.x += (n.m.__home[0] - n.x) * 0.02; n.y += (n.m.__home[1] - n.y) * 0.02;
        n.x = Math.min(Math.max(n.x, f.x + n.w / 2 + 2), f.x + f.w - n.w / 2 - 2);
        n.y = Math.min(Math.max(n.y, top + n.h / 2), f.y + f.h - n.h / 2 - 2);
      }
      if (!moved && it > 20) break;
    }
    for (const n of nodes) {
      const cx = n.x, cy = n.y - labelH / 2;     // marker sits above its label
      placeDot(n.m, cx, cy, n.m.__r);
      n.m.__label.setAttribute("x", cx);
      // diamonds are rotated squares, so they reach ~1.2x further down than a circle
      n.m.__label.setAttribute("y", cy + n.m.__r * (n.m.tagName === "rect" ? 1.25 : 1) + 9);
      n.m.__leader.setAttribute("x2", cx);
      n.m.__leader.setAttribute("y2", cy);
    }
    document.querySelectorAll("#inset .inset-dot").forEach((m) => {
      const off = m.classList.contains("hidden");
      for (const k of ["__pin", "__leader", "__label"]) m[k].classList.toggle("hidden", off);
    });
  }

  function placeDot(d, x, y, rad) {
    if (d.tagName === "rect") {
      const s = rad * 1.7;
      d.setAttribute("x", x - s / 2); d.setAttribute("y", y - s / 2);
      d.setAttribute("width", s); d.setAttribute("height", s);
      d.setAttribute("transform", `rotate(45 ${x} ${y})`);
    } else {
      d.setAttribute("cx", x); d.setAttribute("cy", y); d.setAttribute("r", rad);
    }
  }

  function stateRecord(code) {
    return byId.get("state-" + String(code).toLowerCase()) || (code === "DC" ? byId.get("city-washington-dc") : null);
  }

  function paint() {
    document.querySelectorAll("#map .state").forEach((p) => {
      const r = stateRecord(p.__code);
      const v = r ? metricValue(r) : null;
      if (v == null) { p.classList.add("nodata"); p.style.fill = "var(--nodata)"; }
      else { p.classList.remove("nodata"); p.style.fill = `var(${SEQ[binIndex(v)]})`; }
    });

    // dots: area ∝ metric among dot records
    const dotVals = records.filter((r) => r.kind !== "state").map(metricValue).filter((v) => v != null);
    const dmax = Math.max(...dotVals, 1);
    const dots = Array.from(document.querySelectorAll("#map .dot"));
    dots.forEach((d) => {
      const v = metricValue(d.__rec);
      const rad = v == null ? 3.5 : 3.5 + 11 * Math.sqrt(Math.max(v, 0) / dmax);
      d.__r = rad;
      d.style.fillOpacity = v == null ? "0.25" : "";
      if (d.__xy) placeDot(d, d.__xy[0], d.__xy[1], rad);
    });
    // big first so small dots stay clickable on top
    const g = $("#dots");
    dots.filter((d) => d.__xy).sort((a, b) => b.__r - a.__r).forEach((d) => g.append(d));
    layoutInset();
    drawLegend();
  }

  function drawLegend() {
    const b = BINS[state.metric];
    const title = state.metric === "fee" ? "State fee (USD)" : "State fee per $1,000 of bonds";
    $("#legend").innerHTML = `
      <div>
        <div>${title}</div>
        <div class="ramp">${SEQ.map((v) => `<i style="background:var(${v})"></i>`).join("")}</div>
        <div class="ticks">${b.ticks.map((t) => `<span>${t}</span>`).join("")}</div>
      </div>
      <span class="key"><i class="sw sq" style="background:var(--nodata);border:1px solid var(--border)"></i>No figure found</span>
      <span class="key"><i class="sw" style="background:var(--city)"></i>City (size = ${state.metric === "fee" ? "fee" : "fee per $1,000"})</span>
      <span class="key"><i class="sw sq" style="background:var(--issuer);transform:rotate(45deg)"></i>Other big issuer</span>`;
  }

  function targetRecord(t) {
    if (t.__rec) return t.__rec;
    if (t.__code) return stateRecord(t.__code) || { placeholder: true, code: t.__code, name: t.__name };
    return null;
  }

  function onHover(e) {
    const r = targetRecord(e.target);
    const tip = $("#tooltip");
    if (!r) { tip.hidden = true; return; }
    if (r.placeholder) {
      tip.innerHTML = `<b>${esc(r.name)}</b><span>No figure found yet</span>`;
    } else {
      const m = metricText(r);
      tip.innerHTML = `<b>${esc(r.name)}</b>${m ? esc(m) : '<span>Fee not disclosed</span>'}<br><span>${esc(r.offering || "")}</span>`;
    }
    tip.hidden = false;
    const wrap = $(".map-wrap").getBoundingClientRect();
    let x = e.clientX - wrap.left + 14, y = e.clientY - wrap.top + 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > wrap.width) x = e.clientX - wrap.left - w - 14;
    if (y + h > wrap.height) y = e.clientY - wrap.top - h - 14;
    tip.style.left = Math.max(0, x) + "px";
    tip.style.top = Math.max(0, y) + "px";
  }

  function onClick(e) {
    const r = targetRecord(e.target);
    if (!r) return;
    if (r.placeholder) showPlaceholder(r);
    else select(r.id);
    // the panel sits below the full-width map, so bring it into view if it's off screen
    $("#panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- panel ----------
  function select(id, scrollRow) {
    state.selected = id;
    const r = byId.get(id);
    document.querySelectorAll("#map .sel, #table tr.sel").forEach((n) => n.classList.remove("sel"));
    if (!r) return;
    const code = r.kind === "state" ? r.state : (r.id === "city-washington-dc" ? "DC" : null);
    if (code) document.querySelector(`#map .state[data-code="${code}"]`)?.classList.add("sel");
    document.querySelectorAll(`#map .dot[data-id="${CSS.escape(id)}"]`).forEach((d) => d.classList.add("sel"));
    const row = document.querySelector(`#table tr[data-id="${CSS.escape(id)}"]`);
    if (row) { row.classList.add("sel"); if (scrollRow) row.scrollIntoView({ block: "nearest" }); }
    renderPanel(r);
  }

  function showPlaceholder(p) {
    document.querySelectorAll("#map .sel").forEach((n) => n.classList.remove("sel"));
    document.querySelector(`#map .state[data-code="${p.code}"]`)?.classList.add("sel");
    $("#panel").innerHTML = `<div class="kind">State</div><h3>${esc(p.name)}</h3>
      <p class="panel-empty">No state-level figure found yet.</p>${relatedList(p.code, null)}`;
  }

  function relatedList(code, selfId) {
    const rel = records.filter((x) => x.state === code && x.id !== selfId && x.kind !== "state");
    const st = stateRecord(code);
    const items = [];
    if (st && st.id !== selfId) items.push(st);
    items.push(...rel);
    if (!items.length) return "";
    return `<div class="more">Also in ${esc(code)}:<ul>${items.map((x) =>
      `<li><button class="link" data-goto="${esc(x.id)}">${esc(x.name)}</button> — ${esc(money(x.underwriter_discount) || "n/a")}</li>`).join("")}</ul></div>`;
  }

  function renderPanel(r) {
    const src = safeUrl(r.source_url);
    const rows = [
      ["Offering", r.offering],
      ["Sale date", dateText(r.sale_date)],
      ["Par amount", moneyFull(r.par_amount)],
      ["Fee per $1,000", r.rate == null ? null : rateText(r.rate)],
      ["Fee as % of par", r.rate == null ? null : (r.rate / 10).toFixed(3) + "%"],
      ["Sale method", r.sale_method && r.sale_method !== "unknown" ? r.sale_method[0].toUpperCase() + r.sale_method.slice(1) : null],
      ["Underwriter(s)", r.lead_underwriters],
      ["Confidence", r.confidence ? `<span class="conf">${esc(r.confidence)}</span>` : null, true],
      ["Source", src ? `<a href="${esc(src)}" target="_blank" rel="noopener">Open document ↗</a>` : null, true]
    ].filter((x) => x[1]);
    $("#panel").innerHTML = `
      <div class="kind">${KIND_LABEL[r.kind]} · ${esc(r.state)}</div>
      <h3>${esc(r.name)}</h3>
      <div class="big">${r.underwriter_discount != null ? esc(moneyFull(r.underwriter_discount)) : "Not disclosed"}</div>
      <div class="big-sub">underwriters' discount on latest offering</div>
      <dl>${rows.map(([k, v, html]) => `<dt>${k}</dt><dd>${html ? v : esc(v)}</dd>`).join("")}</dl>
      ${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}
      ${relatedList(r.state, r.id)}`;
  }

  // ---------- table ----------
  function renderTable() {
    const q = $("#search").value.trim().toLowerCase();
    const kind = $("#kind").value;
    const { key, dir } = state.sort;
    const rows = records
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => !q || [r.name, r.state, r.lead_underwriters, r.offering].join(" ").toLowerCase().includes(q))
      .sort((a, b) => {
        const va = a[key], vb = b[key];
        if (va == null && vb == null) return a.name.localeCompare(b.name);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
      });
    const na = '<span class="na">—</span>';
    $("#table tbody").innerHTML = rows.map((r) => {
      const src = safeUrl(r.source_url);
      return `<tr data-id="${esc(r.id)}" class="${r.id === state.selected ? "sel" : ""}">
        <td class="name">${esc(r.name)}</td>
        <td>${KIND_LABEL[r.kind]}</td>
        <td>${esc(r.state)}</td>
        <td>${esc(dateText(r.sale_date)) || na}</td>
        <td class="num">${esc(money(r.par_amount)) || na}</td>
        <td class="num">${esc(moneyFull(r.underwriter_discount)) || na}</td>
        <td class="num">${esc(rateText(r.rate)) || na}</td>
        <td>${esc(r.sale_method && r.sale_method !== "unknown" ? r.sale_method : "") || na}</td>
        <td>${src ? `<a href="${esc(src)}" target="_blank" rel="noopener">link</a>` : na}</td>
      </tr>`;
    }).join("");
    document.querySelectorAll("#table th[data-sort]").forEach((th) => {
      th.classList.toggle("asc", th.dataset.sort === key && dir === 1);
      th.classList.toggle("desc", th.dataset.sort === key && dir === -1);
    });
  }

  function renderStats() {
    const withFee = records.filter((r) => r.underwriter_discount != null);
    const total = withFee.reduce((s, r) => s + r.underwriter_discount, 0);
    const par = withFee.reduce((s, r) => s + (r.par_amount || 0), 0);
    const top = withFee.slice().sort((a, b) => b.underwriter_discount - a.underwriter_discount)[0];
    const states = records.filter((r) => r.kind === "state").length;
    const cities = records.filter((r) => r.kind === "city").length;
    const others = records.filter((r) => r.kind === "issuer").length;
    $("#stats").innerHTML = [
      [money(total), `in fees across ${withFee.length} deals`],
      [par ? "$" + (total / par * 1000).toFixed(2) : "—", "average fee per $1,000"],
      [top ? money(top.underwriter_discount) : "—", top ? `largest: ${top.name}` : ""],
      [`${states} · ${cities} · ${others}`, "states · cities · other issuers"]
    ].map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");
  }

  // ---------- wiring ----------
  function wire() {
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
      state.metric = b.dataset.metric;
      document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      paint();
    }));
    document.querySelectorAll("[data-layer]").forEach((c) => c.addEventListener("change", () => {
      const layer = c.dataset.layer;
      const sel = layer === "cities" ? ".dot.city" : layer === "issuers" ? ".dot.issuer" : null;
      if (sel) { document.querySelectorAll("#map " + sel).forEach((d) => d.classList.toggle("hidden", !c.checked)); layoutInset(); }
      if (layer === "states") paintStatesLayer(c.checked);
    }));
    $("#search").addEventListener("input", renderTable);
    $("#kind").addEventListener("change", renderTable);
    document.querySelectorAll("#table th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: typeof records[0]?.[k] === "string" ? 1 : -1 };
      renderTable();
    }));
    $("#table tbody").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const tr = e.target.closest("tr[data-id]");
      if (tr) { select(tr.dataset.id); $(".map-wrap").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    });
    $("#panel").addEventListener("click", (e) => {
      const b = e.target.closest("[data-goto]");
      if (b) select(b.dataset.goto, true);
    });
  }

  function paintStatesLayer(on) {
    if (on) { paint(); return; }
    document.querySelectorAll("#map .state").forEach((p) => { p.classList.add("nodata"); p.style.fill = "var(--nodata)"; });
  }

  Promise.all([
    fetch("vendor/states-albers-10m.json").then((r) => r.json()),
    fetch("data/issuers.json").then((r) => r.json())
  ]).then(([us, data]) => {
    records = data.map((r) => ({
      ...r,
      rate: r.underwriter_discount != null && r.par_amount ? (r.underwriter_discount / r.par_amount) * 1000 : null
    }));
    byId = new Map(records.map((r) => [r.id, r]));
    drawMap(us);
    paint();
    renderStats();
    renderTable();
    wire();
  }).catch((err) => {
    $("#panel").innerHTML = `<p class="panel-empty">Could not load data: ${esc(err.message)}</p>`;
  });
})();
