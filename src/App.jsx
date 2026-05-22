import { useState, useMemo } from "react";

// ── Children ────────────────────────────────────────────────────────
const CHILDREN = [
  { id: "boy1",     name: "Boy #1",   startGrade: 11, gender: "M" },
  { id: "brendan",  name: "Brendan",  startGrade: 8,  gender: "M" },
  { id: "emmeline", name: "Emmeline", startGrade: 6,  gender: "F" },
  { id: "julia",    name: "Julia",    startGrade: 3,  gender: "F" },
];

const DEFAULTS = {
  sjpiiMiddle: 9100, sjpiiLower: 7975, sjpiiRate: 3,
  girlsHsBase: 31000, hsRate: 5,
  disc2: 20, disc3: 30, staffDisc: 20,
  supplyFee: 150, securityFee: 200,
  voucherTotal: 10500, voucherIncidentals: 2500,
  employerBenefit: 10000,
};

// ── Themes ──────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: "#f4f7fb", cardBg: "#ffffff", border: "#ccd8e8",
    shadow: "0 1px 4px rgba(0,0,0,0.07)",
    text: "#18293d", sub: "#4a6278", label: "#566e84",
    cell: "#253444", cellMute: "#7a94a8",
    rowAlt: "#f7fafd", rowHot: "#fff1f2", rowHotBorder: "#fca5a5",
    green: "#15803d", blue: "#1d4ed8", purple: "#7c3aed",
    red: "#b91c1c", amber: "#b45309", stranded: "#94a3b8",
    badgeBg: "#b45309", badgeText: "#fff",
    inputBg: "#f4f7fb", inputBorder: "#ccd8e8", inputText: "#18293d",
    warnBg: "#fffbeb", warnBorder: "#fcd34d", warnText: "#92400e",
    tfootBg: "#edf2f8",
    toggleBg: "#e2eaf4", toggleText: "#4a6278",
    pillOpacity: "30", pillBorderOpacity: "60",
    divider: "#d0dce8",
  },
  dark: {
    bg: "#0d1520", cardBg: "#13202f", border: "#253648",
    shadow: "none",
    text: "#ddeaf6", sub: "#8aacbf", label: "#8aacbf",
    cell: "#a8c4d8", cellMute: "#4a6a80",
    rowAlt: "#0f1d2d", rowHot: "#1e0808", rowHotBorder: "transparent",
    green: "#4ade80", blue: "#60a5fa", purple: "#c084fc",
    red: "#f87171", amber: "#fbbf24", stranded: "#4a6a80",
    badgeBg: "#f59e0b", badgeText: "#0d1520",
    inputBg: "#0d1520", inputBorder: "#253648", inputText: "#ddeaf6",
    warnBg: "#1c1000", warnBorder: "#b45309", warnText: "#fbbf24",
    tfootBg: "#0f1d2d",
    toggleBg: "#1e2f42", toggleText: "#8aacbf",
    pillOpacity: "18", pillBorderOpacity: "40",
    divider: "#253648",
  },
};

// ── Model ────────────────────────────────────────────────────────────
function getSchool(grade, gender) {
  if (grade > 12) return "done";
  if (gender === "M") return grade <= 8 ? "sjpii" : "boys_hs";
  return grade <= 8 ? "sjpii" : "girls_hs";
}

function sjpiiPerChild(kids, yi, p) {
  if (!kids.length) return {};
  const sorted = [...kids].sort((a, b) => b.grade - a.grade);
  const discRates = [0, p.disc2 / 100, p.disc3 / 100];
  const items = sorted.map((k, i) => {
    const base = (k.grade >= 6 ? p.sjpiiMiddle : p.sjpiiLower) * Math.pow(1 + p.sjpiiRate / 100, yi);
    const d = discRates[i] ?? 0;
    const staffContrib = base * (1 - d) + p.supplyFee + p.securityFee;
    const gradeFee = k.grade === 8 ? 50 : k.grade === 6 ? 525 : 0;
    return { id: k.id, net: staffContrib * (1 - p.staffDisc / 100) + gradeFee };
  });
  return Object.fromEntries(items.map(x => [x.id, x.net]));
}

function buildModel(p, withEmployer = true) {
  const rows = [];
  const vB = Object.fromEntries(CHILDREN.map(c => [c.id, 0]));

  for (let yi = 0; yi < 10; yi++) {
    const kids = CHILDREN.map(c => ({
      ...c, grade: c.startGrade + yi,
      school: getSchool(c.startGrade + yi, c.gender),
    }));
    const sjpiiKids = kids.filter(k => k.school === "sjpii");
    const girlsKids = kids.filter(k => k.school === "girls_hs");
    const enrolled  = kids.filter(k => k.school !== "done");

    const sjpiiMap  = sjpiiPerChild(sjpiiKids, yi, p);
    const girlsRate = p.girlsHsBase * Math.pow(1 + p.hsRate / 100, yi);

    const childObs = Object.fromEntries(kids.map(k => {
      let ob = 0;
      if (k.school === "sjpii")    ob = sjpiiMap[k.id] || 0;
      if (k.school === "girls_hs") ob = girlsRate;
      return [k.id, ob];
    }));

    const obligation = Object.values(childObs).reduce((s, v) => s + v, 0);

    // Step 1: Add voucher allocations to each child's balance
    let totalVAlloc = 0;
    CHILDREN.forEach(c => {
      const isEnrolled = kids.find(k => k.id === c.id).school !== "done";
      const alloc = isEnrolled ? (p.voucherTotal - p.voucherIncidentals) : 0;
      vB[c.id] += alloc;
      totalVAlloc += alloc;
    });

    // Step 2: Apply employer proportionally to each child's obligation (employer first)
    const empApplied = withEmployer ? Math.min(p.employerBenefit, obligation) : 0;
    const childAfterEmp = Object.fromEntries(CHILDREN.map(c => {
      const share = (obligation > 0 && childObs[c.id] > 0)
        ? (childObs[c.id] / obligation) * empApplied : 0;
      return [c.id, childObs[c.id] - share];
    }));

    // Step 3: Apply each child's vouchers to their remaining obligation
    let totalVApplied = 0, totalShortfall = 0;
    CHILDREN.forEach(c => {
      const remaining = childAfterEmp[c.id];
      const applied = Math.min(vB[c.id], remaining);
      vB[c.id] -= applied;
      totalVApplied += applied;
      totalShortfall += Math.max(0, remaining - applied);
    });

    const sjpiiNet  = Object.values(sjpiiMap).reduce((s, v) => s + v, 0);
    const girlsCost = girlsKids.length * girlsRate;
    const girlsVBal = (vB.emmeline || 0) + (vB.julia || 0);
    const boysVBal  = (vB.boy1 || 0) + (vB.brendan || 0);

    rows.push({
      yi, kids, sjpiiKids, girlsKids, enrolled,
      sjpiiNet, girlsCost, girlsRate, obligation,
      childObs, vAlloc: totalVAlloc,
      empApplied, vApplied: totalVApplied, oop: totalShortfall,
      girlsVBal, boysVBal, vBalsSnap: { ...vB },
    });
  }
  return rows;
}

function findStopYear(mainModel, p) {
  for (let S = 0; S < 10; S++) {
    const startBals = S === 0
      ? Object.fromEntries(CHILDREN.map(c => [c.id, 0]))
      : { ...mainModel[S - 1].vBalsSnap };
    const bals = { ...startBals };
    let ok = true;
    for (let yi = S; yi < 10; yi++) {
      const r = mainModel[yi];
      let shortfall = 0;
      CHILDREN.forEach(c => {
        const isEnrolled = r.kids.find(k => k.id === c.id).school !== "done";
        if (isEnrolled) bals[c.id] += (p.voucherTotal - p.voucherIncidentals);
        const ob = r.childObs[c.id] || 0;
        const applied = Math.min(bals[c.id], ob);
        bals[c.id] -= applied;
        shortfall += ob - applied;
      });
      if (shortfall > 0) { ok = false; break; }
    }
    if (ok) return S;
  }
  return null;
}

// ── Formatting ───────────────────────────────────────────────────────
const fmt  = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const dash = n => n === 0 ? "—" : fmt(n);
const yr   = yi => `${2026 + yi}–${String(2027 + yi).slice(2)}`;

const SCHOOL_META = {
  sjpii:    { label: "SJPII",     color: "#3b82f6" },
  boys_hs:  { label: "Boys HS ✦", color: "#64748b" },
  girls_hs: { label: "Girls HS",  color: "#9333ea" },
  done:     { label: "—",         color: "#94a3b8"  },
};

const PARAMS = [
  { label: "SJPII Middle School",        key: "sjpiiMiddle",       pre: "$" },
  { label: "SJPII Lower School",         key: "sjpiiLower",        pre: "$" },
  { label: "SJPII Annual Increase",      key: "sjpiiRate",         suf: "%" },
  { label: "Girls' HS Base Tuition",     key: "girlsHsBase",       pre: "$" },
  { label: "HS Annual Increase",         key: "hsRate",            suf: "%" },
  { label: "2nd Child Discount (SJPII)", key: "disc2",             suf: "%" },
  { label: "3rd Child Discount (SJPII)", key: "disc3",             suf: "%" },
  { label: "Staff Discount (SJPII)",     key: "staffDisc",         suf: "%" },
  { label: "Supply Fee / Student",       key: "supplyFee",         pre: "$" },
  { label: "Security Fee / Student",     key: "securityFee",       pre: "$" },
  { label: "Voucher Total / Child / Yr", key: "voucherTotal",      pre: "$" },
  { label: "Voucher for Incidentals",    key: "voucherIncidentals",pre: "$" },
  { label: "Employer Benefit / Year",    key: "employerBenefit",   pre: "$" },
];

// ── Component ────────────────────────────────────────────────────────
export default function TuitionModel() {
  const [p, setP]       = useState(DEFAULTS);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [fsz,  setFsz]  = useState("M");

  const model   = useMemo(() => buildModel(p, true),  [p]);
  const modelNE = useMemo(() => buildModel(p, false), [p]);
  const stop    = useMemo(() => findStopYear(model, p), [model, p]);

  const T = useMemo(() => ({
    obligation: model.reduce((s, r) => s + r.obligation,  0),
    emp:        model.reduce((s, r) => s + r.empApplied,  0),
    vouchers:   model.reduce((s, r) => s + r.vApplied,    0),
    oop:        model.reduce((s, r) => s + r.oop,          0),
    oopNE:      modelNE.reduce((s, r) => s + r.oop,        0),
    sjpii:      model.reduce((s, r) => s + r.sjpiiNet,     0),
    girls:      model.reduce((s, r) => s + r.girlsCost,   0),
    alloc:      model.reduce((s, r) => s + r.vAlloc,       0),
    stranded:   model[model.length - 1].boysVBal,
  }), [model, modelNE]);

  const upd = (key, val) => setP(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  const th  = dark ? THEMES.dark : THEMES.light;
  const base = { S: 11, M: 13, L: 15 }[fsz];

  // ── Style helpers ──
  const card  = { background: th.cardBg, border: `1px solid ${th.border}`, boxShadow: th.shadow, borderRadius: "8px", padding: "16px", marginBottom: "14px" };
  const secHd = { fontSize: base - 2 + "px", fontWeight: "700", color: th.label, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "12px" };
  const tblS  = { width: "100%", borderCollapse: "collapse", fontSize: base + "px" };
  const thS   = { padding: "7px 10px", textAlign: "right", fontSize: base - 2 + "px", color: th.label, letterSpacing: "0.8px", textTransform: "uppercase", borderBottom: `1px solid ${th.border}`, whiteSpace: "nowrap" };
  const tdS   = { padding: "7px 10px", textAlign: "right", fontFamily: "monospace", borderBottom: `1px solid ${th.divider}`, fontSize: base + "px", color: th.cell };
  const tdL   = { ...tdS, fontFamily: "inherit", textAlign: "left" };

  const Pill  = ({ school }) => {
    const m = SCHOOL_META[school];
    if (school === "done") return <span style={{ color: th.cellMute }}>—</span>;
    return (
      <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "4px",
        fontSize: base - 2 + "px", background: m.color + th.pillOpacity,
        color: m.color, border: `1px solid ${m.color + th.pillBorderOpacity}`, minWidth: "90px" }}>
        {school !== "done" ? school : "—"}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", background: th.bg, color: th.text, minHeight: "100vh", padding: "20px 24px", fontSize: base + "px" }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: base + 7 + "px", fontWeight: "700", color: th.text, letterSpacing: "-0.3px", margin: "0 0 3px" }}>Tuition Projection · 2026–2036</div>
          <div style={{ fontSize: base - 1 + "px", color: th.sub }}>Four children · Ten school years · Per-child vouchers · Employer benefit applied first</div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginTop: "2px" }}>
          {/* Font size */}
          <div style={{ display: "flex", background: th.toggleBg, borderRadius: "6px", overflow: "hidden", border: `1px solid ${th.border}` }}>
            {["S","M","L"].map(f => (
              <button key={f} onClick={() => setFsz(f)}
                style={{ padding: "4px 10px", fontSize: "12px", fontFamily: "monospace", border: "none", cursor: "pointer",
                  background: fsz === f ? (dark ? "#253648" : "#c8d8e8") : "transparent",
                  color: fsz === f ? th.text : th.toggleText, fontWeight: fsz === f ? "700" : "400" }}>
                {f}
              </button>
            ))}
          </div>
          {/* Dark/light toggle */}
          <button onClick={() => setDark(v => !v)}
            style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${th.border}`,
              background: th.toggleBg, color: th.toggleText, cursor: "pointer", fontSize: "14px" }}>
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px", marginBottom: "14px" }}>
        {[
          { lbl: "Total Obligation",      val: T.obligation, clr: th.text },
          { lbl: "Employer Benefit",      val: T.emp,        clr: th.green },
          { lbl: "Vouchers Applied",      val: T.vouchers,   clr: th.blue },
          { lbl: "Out-of-Pocket",         val: T.oop,        clr: T.oop > 0 ? th.red : th.green },
          { lbl: "Stranded (Boys' Vtrs)", val: T.stranded,   clr: th.stranded },
        ].map(s => (
          <div key={s.lbl} style={{ ...card, padding: "12px 14px", marginBottom: 0 }}>
            <div style={{ fontSize: base - 2 + "px", color: th.label, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" }}>{s.lbl}</div>
            <div style={{ fontFamily: "monospace", fontSize: base + 5 + "px", fontWeight: "700", color: s.clr }}>{fmt(s.val)}</div>
          </div>
        ))}
      </div>

      {/* ── Callout ── */}
      <div style={{ display: "flex", gap: "13px", background: th.cardBg, border: `1px solid ${th.amber}`, borderRadius: "8px", padding: "13px 16px", marginBottom: "14px", alignItems: "flex-start", boxShadow: th.shadow }}>
        <div style={{ fontFamily: "monospace", fontSize: base - 2 + "px", fontWeight: "700", padding: "3px 9px", borderRadius: "4px", flexShrink: 0, marginTop: "1px", background: th.badgeBg, color: th.badgeText, whiteSpace: "nowrap" }}>
          {stop === null ? "KEEP ALL 10 YEARS" : `STOP: ${yr(stop)}`}
        </div>
        <div style={{ fontSize: base + "px", color: th.sub, lineHeight: "1.65" }}>
          {stop === null ? <>
            <strong style={{ color: th.amber }}>The employer benefit remains valuable through 2035–36.</strong>{" "}
            Even with employer-first ordering (which maximizes voucher accumulation), the girls' HS years generate obligations that outpace each girl's individual voucher balance.
            Total 10-year out-of-pocket: <strong style={{ color: th.red }}>{fmt(T.oop)}</strong> with employer,{" "}
            <strong style={{ color: th.red }}>{fmt(T.oopNE)}</strong> without.
          </> : <>
            <strong style={{ color: th.amber }}>Starting {yr(stop)}, accumulated vouchers independently cover all remaining tuition.</strong>{" "}
            You can stop taking the employer benefit from that year forward.
          </>}
        </div>
      </div>

      {/* ── Parameters ── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(v => !v)}>
          <div style={secHd}>Model Parameters</div>
          <div style={{ fontSize: base - 1 + "px", color: th.label }}>{open ? "▲ hide" : "▼ edit"}</div>
        </div>
        {open && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "12px" }}>
            {PARAMS.map(({ label, key, pre, suf }) => (
              <div key={key}>
                <div style={{ fontSize: base - 2 + "px", color: th.label, marginBottom: "4px" }}>{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {pre && <span style={{ color: th.cellMute, fontSize: base + "px" }}>{pre}</span>}
                  <input type="number" value={p[key]} onChange={e => upd(key, e.target.value)}
                    style={{ flex: 1, background: th.inputBg, border: `1px solid ${th.inputBorder}`, borderRadius: "4px",
                      color: th.inputText, padding: "4px 7px", fontFamily: "monospace", fontSize: base + "px", outline: "none", minWidth: 0 }} />
                  {suf && <span style={{ color: th.cellMute, fontSize: base + "px" }}>{suf}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Enrollment ── */}
      <div style={card}>
        <div style={secHd}>Enrollment by Year</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tblS}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: "left", minWidth: "68px" }}>Year</th>
                {CHILDREN.map(c => <th key={c.id} style={{ ...thS, textAlign: "center" }}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {model.map(r => (
                <tr key={r.yi} style={{ background: r.yi % 2 ? th.rowAlt : "transparent" }}>
                  <td style={{ ...tdL, color: th.sub, fontSize: base - 1 + "px" }}>{yr(r.yi)}</td>
                  {r.kids.map(k => {
                    const m = SCHOOL_META[k.school];
                    return (
                      <td key={k.id} style={{ ...tdS, textAlign: "center", padding: "5px 8px" }}>
                        {k.school !== "done"
                          ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "4px",
                              fontSize: base - 1 + "px", fontFamily: "Georgia, serif",
                              background: m.color + th.pillOpacity, color: m.color,
                              border: `1px solid ${m.color + th.pillBorderOpacity}`, minWidth: "88px" }}>
                              {`Gr ${k.grade} · ${m.label}`}
                            </span>
                          : <span style={{ color: th.divider }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: base - 2 + "px", color: th.label, marginTop: "8px", lineHeight: "1.6" }}>
          ✦ Boys' HS net tuition = $0. Each enrolled boy still generates {fmt(p.voucherTotal - p.voucherIncidentals)}/yr in voucher allocation — but it cannot be applied to the girls' bills.
        </div>
      </div>

      {/* ── Per-child voucher balances ── */}
      <div style={card}>
        <div style={secHd}>Per-Child Voucher Balances — End of Year</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tblS}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: "left" }}>Year</th>
                {CHILDREN.map(c => <th key={c.id} style={thS}>{c.name}</th>)}
                <th style={{ ...thS, color: th.purple, borderLeft: `1px solid ${th.border}` }}>Girls' Total</th>
                <th style={{ ...thS, color: th.stranded }}>Boys' Stranded</th>
              </tr>
            </thead>
            <tbody>
              {model.map(r => (
                <tr key={r.yi} style={{ background: r.yi % 2 ? th.rowAlt : "transparent" }}>
                  <td style={{ ...tdL, color: th.sub, fontSize: base - 1 + "px" }}>{yr(r.yi)}</td>
                  {CHILDREN.map(c => {
                    const bal = r.vBalsSnap[c.id] || 0;
                    const isGirl = c.gender === "F";
                    const clr = isGirl
                      ? (bal > 15000 ? th.green : bal > 0 ? th.amber : th.cellMute)
                      : th.stranded;
                    return <td key={c.id} style={{ ...tdS, color: clr }}>{bal > 0 ? fmt(bal) : "—"}</td>;
                  })}
                  <td style={{ ...tdS, borderLeft: `1px solid ${th.border}`, color: r.girlsVBal > 10000 ? th.purple : r.girlsVBal > 0 ? th.amber : th.cellMute, fontWeight: "600" }}>
                    {fmt(r.girlsVBal)}
                  </td>
                  <td style={{ ...tdS, color: th.stranded }}>{fmt(r.boysVBal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: th.warnBg, border: `1px solid ${th.warnBorder}`, borderRadius: "6px", padding: "8px 12px", fontSize: base - 1 + "px", color: th.warnText, marginTop: "10px", lineHeight: "1.6" }}>
          Boys' stranded balance at end of window: <strong>{fmt(T.stranded)}</strong>. Generated but unusable for tuition under the per-child rule. Worth knowing if program rules change or if other qualifying expenses apply.
        </div>
      </div>

      {/* ── Main financials ── */}
      <div style={card}>
        <div style={secHd}>Year-by-Year Financials</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tblS}>
            <thead>
              <tr>
                <th style={{ ...thS, textAlign: "left" }}>Year</th>
                <th style={thS}>SJPII Net</th>
                <th style={{ ...thS, color: th.purple }}>Girls HS</th>
                <th style={{ ...thS, color: th.text, borderLeft: `1px solid ${th.border}`, fontWeight: "700" }}>Obligation</th>
                <th style={thS}>Voucher Alloc</th>
                <th style={{ ...thS, color: th.green }}>Employer</th>
                <th style={{ ...thS, color: th.blue }}>Vouchers Used</th>
                <th style={{ ...thS, color: th.red }}>Out of Pocket</th>
                <th style={{ ...thS, color: th.purple }}>Girls' Vtr Bal</th>
              </tr>
            </thead>
            <tbody>
              {model.map(r => {
                const hot = r.oop > 0;
                return (
                  <tr key={r.yi} style={{ background: hot ? th.rowHot : r.yi % 2 ? th.rowAlt : "transparent" }}>
                    <td style={{ ...tdL, color: th.sub, fontSize: base - 1 + "px" }}>{yr(r.yi)}</td>
                    <td style={tdS}>{dash(r.sjpiiNet)}</td>
                    <td style={{ ...tdS, color: r.girlsCost > 0 ? th.purple : th.cellMute }}>{dash(r.girlsCost)}</td>
                    <td style={{ ...tdS, borderLeft: `1px solid ${th.border}`, color: th.text, fontWeight: "600" }}>{fmt(r.obligation)}</td>
                    <td style={{ ...tdS, color: th.cellMute }}>{fmt(r.vAlloc)}</td>
                    <td style={{ ...tdS, color: th.green }}>{dash(r.empApplied)}</td>
                    <td style={{ ...tdS, color: th.blue }}>{dash(r.vApplied)}</td>
                    <td style={{ ...tdS, color: hot ? th.red : th.cellMute, fontWeight: hot ? "700" : "400" }}>{dash(r.oop)}</td>
                    <td style={{ ...tdS, color: r.girlsVBal > 10000 ? th.purple : r.girlsVBal > 0 ? th.amber : th.cellMute }}>{fmt(r.girlsVBal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${th.border}`, background: th.tfootBg }}>
                <td style={{ ...tdL, color: th.text, fontWeight: "700", fontSize: base + "px" }}>10-Year Total</td>
                <td style={{ ...tdS, color: th.sub }}>{fmt(T.sjpii)}</td>
                <td style={{ ...tdS, color: th.purple }}>{fmt(T.girls)}</td>
                <td style={{ ...tdS, borderLeft: `1px solid ${th.border}`, color: th.text, fontWeight: "700" }}>{fmt(T.obligation)}</td>
                <td style={{ ...tdS, color: th.cellMute }}>{fmt(T.alloc)}</td>
                <td style={{ ...tdS, color: th.green, fontWeight: "700" }}>{fmt(T.emp)}</td>
                <td style={{ ...tdS, color: th.blue, fontWeight: "700" }}>{fmt(T.vouchers)}</td>
                <td style={{ ...tdS, color: th.red, fontWeight: "700" }}>{fmt(T.oop)}</td>
                <td style={tdS}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ fontSize: base - 2 + "px", color: th.label, lineHeight: "1.8" }}>
        <strong>Model notes:</strong> Employer benefit applied first each year, distributed proportionally across children with non-zero obligations — this maximizes each child's voucher accumulation. Then each child's voucher covers their remaining obligation. Voucher surplus rolls over per child; boys' surplus is permanently stranded. SJPII staff discount distributed proportionally to each child's staff-base share. Girls' HS at full sticker with 5% annual escalation from 2026–27 base. Nominal dollars.
      </div>
    </div>
  );
}