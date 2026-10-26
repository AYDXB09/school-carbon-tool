/* =============================================================================
   School Carbon — PDF download
   Builds a real, vector PDF (jsPDF) with clickable source links. This replaces
   browser printing entirely: the button says Download and produces this file.
   ============================================================================= */
(function (root) {
  "use strict";

  function fmt(n, dp) { dp = dp == null ? 1 : dp; return Number(n).toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp }); }

  // palette (RGB) to match the app
  var INK = [22, 38, 29], INK2 = [74, 90, 80], INK3 = [122, 137, 127];
  var GREEN = [30, 122, 80], LINE = [216, 228, 218], SOFT = [242, 247, 242];
  var SCOPE = { 1: [232, 131, 58], 2: [62, 124, 177], 3: [109, 165, 68] };

  function generate(result) {
    if (!root.jspdf || !root.jspdf.jsPDF) { alert("PDF library did not load. Please check your connection and reload."); return; }
    var doc = new root.jspdf.jsPDF({ unit: "pt", format: "a4" });

    /* jsPDF built in fonts are WinAnsi only and cannot draw characters like the
       CO2 subscript, the multiply sign, or m3. Convert every string we draw to
       clean ASCII so the report never shows garbled, wide spaced text. */
    function A(s) {
      return String(s == null ? "" : s)
        .replace(/₂/g, "2").replace(/²/g, "2").replace(/³/g, "3")
        .replace(/×/g, "x").replace(/[–—]/g, "-")
        .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/→/g, "to").replace(/·/g, ".").replace(/ /g, " ")
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
    }
    var _text = doc.text.bind(doc);
    doc.text = function (t, x, y, o) { return _text(Array.isArray(t) ? t.map(A) : A(t), x, y, o); };
    var _tl = doc.textWithLink.bind(doc);
    doc.textWithLink = function (t, x, y, o) { return _tl(A(t), x, y, o); };
    var _split = doc.splitTextToSize.bind(doc);
    doc.splitTextToSize = function (t, w, o) { return _split(A(t), w, o); };
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 48, x = M, y = M, cw = W - M * 2;

    function setColor(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function need(space) { if (y + space > H - M) { doc.addPage(); y = M; } }
    function rule() { doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.8); doc.line(x, y, x + cw, y); }

    /* ---- header band ---- */
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(0, 0, W, 84, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text("School Carbon Footprint Report", M, 42);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    var sub = (result.input.school_name ? result.input.school_name + "  |  " : "") +
      "Period " + (result.input.period_start || "n/a") + " to " + (result.input.period_end || "n/a");
    doc.text(sub, M, 60);
    doc.setFontSize(8.5);
    doc.text("Generated " + result.generatedAt.slice(0, 10) + "  |  Factor set " + result.factorSetVersion, M, 74);
    y = 116;

    /* ---- the number ---- */
    setColor(INK3); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("ESTIMATED ANNUAL FOOTPRINT", x, y); y += 30;
    setColor(INK); doc.setFontSize(40);
    doc.text(fmt(result.total, 0) + " tCO2e", x, y); y += 22;
    setColor(INK2); doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    doc.text("Most likely between " + fmt(result.range.p10, 0) + " and " + fmt(result.range.p90, 0) +
      " tonnes (10th to 90th percentile, 4,000 simulations).", x, y); y += 16;
    doc.setFontSize(9.5); setColor(INK3);
    doc.text("Grid region: " + result.grid.label, x, y); y += 24;

    /* ---- scope split ---- */
    need(90);
    setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Where it comes from", x, y); y += 8; rule(); y += 18;
    [1, 2, 3].forEach(function (s) {
      var v = result.scopes[s], p = result.total > 0 ? (v / result.total) * 100 : 0;
      var c = SCOPE[s];
      doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(x, y - 8, 10, 10, 2, 2, "F");
      setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Scope " + s, x + 18, y);
      setColor(INK2); doc.setFont("helvetica", "normal");
      doc.text(fmt(v, 1) + " t", x + cw - 90, y);
      doc.text(p.toFixed(0) + "%", x + cw - 24, y, { align: "right" });
      // bar
      var barY = y + 6, barW = cw, fw = Math.max(2, (p / 100) * barW);
      doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]); doc.roundedRect(x, barY, barW, 4, 2, 2, "F");
      doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(x, barY, fw, 4, 2, 2, "F");
      y += 26;
    });
    y += 8;

    /* ---- category table (shown work) ---- */
    need(60);
    setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("How we reached the number", x, y); y += 8; rule(); y += 8;
    setColor(INK3); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("CATEGORY", x, y); doc.text("SOURCE", x + 210, y);
    doc.text("TONNES", x + cw - 96, y, { align: "right" }); doc.text("BASIS", x + cw, y, { align: "right" });
    y += 6; rule(); y += 14;
    result.categories.forEach(function (cat) {
      need(40);
      setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text(cat.label, x, y);
      // source link
      setColor(GREEN); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      var sname = cat.source ? (cat.source.short || cat.source.name) : "";
      doc.textWithLink(sname, x + 210, y, { url: cat.source ? cat.source.url : "#" });
      setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text(fmt(cat.tCO2e, 1), x + cw - 96, y, { align: "right" });
      setColor(INK3); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(cat.tier === "measured" ? "your data" : "estimated", x + cw, y, { align: "right" });
      // formula line
      y += 12; setColor(INK2); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      var flines = doc.splitTextToSize(cat.formula, cw - 4);
      doc.text(flines, x, y); y += flines.length * 10 + 8;
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.4); doc.line(x, y - 4, x + cw, y - 4);
    });
    y += 6;

    /* ---- confidence ---- */
    need(60);
    var mp = Math.round(result.measuredPct);
    setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("How solid is this estimate?", x, y); y += 8; rule(); y += 16;
    doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]); doc.roundedRect(x, y - 8, cw, 10, 3, 3, "F");
    doc.setFillColor(46, 158, 99); doc.roundedRect(x, y - 8, Math.max(4, (mp / 100) * cw), 10, 3, 3, "F");
    y += 18; setColor(INK2); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    var ctext = doc.splitTextToSize(mp + "% of this footprint comes from data you entered; the rest is estimated from published averages for schools like yours. This is a decision grade estimate, accurate enough to plan and act on and to set a consistent baseline. It is not a third party verified or certified footprint.", cw);
    doc.text(ctext, x, y); y += ctext.length * 12 + 14;

    /* ---- sources ---- */
    need(70);
    setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Sources and methodology", x, y); y += 8; rule(); y += 16;
    var used = {};
    result.categories.forEach(function (c) { if (c.source) used[c.source.url] = c.source; });
    if (result.grid && result.grid.source) used[result.grid.source.url] = result.grid.source;
    Object.keys(used).forEach(function (u) {
      var s = used[u]; need(34);
      setColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text(s.name, x, y);
      setColor(GREEN); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.textWithLink(s.url, x, y + 11, { url: s.url });
      setColor(INK3); doc.setFontSize(8);
      var note = doc.splitTextToSize(s.note || "", cw);
      doc.text(note, x, y + 22); y += 22 + note.length * 9 + 8;
    });

    /* ---- disclaimer footer on last page ---- */
    need(50); y += 4; rule(); y += 14;
    setColor(INK3); doc.setFont("helvetica", "italic"); doc.setFontSize(8);
    var dis = doc.splitTextToSize("This is a decision grade screening estimate, not a certified or third party verified footprint, and not itself a carbon offset. It does not satisfy any mandatory reporting requirement. For verified offsetting, engage a qualified verifier.", cw);
    doc.text(dis, x, y);

    var fname = "School-Carbon-Report" + (result.input.school_name ? "-" + result.input.school_name.replace(/[^a-z0-9]+/gi, "-") : "") + "-" + result.generatedAt.slice(0, 10) + ".pdf";
    doc.save(fname);
  }

  root.SCHOOLCARBON = root.SCHOOLCARBON || {};
  root.SCHOOLCARBON.download = { generate: generate };
})(typeof window !== "undefined" ? window : this);
