/* Givedle — daily "which does more good per dollar?" game.
 * Usage: <div id="devdle-gw"></div> + givewell_ce.js + this file. */
(function () {
  "use strict";
  var CFG = { name: "Givedle", rounds: 5, minRatio: 2, withinRounds: 2, startDate: "2026-09-23", seed: 31337, storageKey: "devdle-gw:v1", shareUrl: "aadhavrajesh.com/givedle" };

  function dayIndex(s, now) {
    now = now || new Date(); var p = s.split("-").map(Number);
    return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(p[0], p[1] - 1, p[2])) / 864e5);
  }
  function rng(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function ratio(a, b) { return Math.max(a.value, b.value) / Math.min(a.value, b.value); }
  function fmt(it) { return it.precision === "range" ? it.value_low + "–" + it.value_high + "×" : (it.value >= 10 || it.precision === "integer" ? Math.round(it.value) : it.value.toFixed(1)) + "×"; }

  // Daily rounds come from a fixed schedule: every valid pair is used once before any pair repeats.
  // The schedule is rebuilt from day 0 on each load, so every player gets the same rounds on the same date.
  // Within-program pairs (clues comparable) and cross-program pairs have separate queues.
  function allPairs(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++)
      if (ratio(items[i], items[j]) >= CFG.minRatio) out.push([items[i], items[j]]);
    return out.sort(function (a, b) { return (a[0].id + a[1].id) < (b[0].id + b[1].id) ? -1 : 1; });
  }
  function buildRounds(items, day) {
    var pairs = allPairs(items), r = rng(CFG.seed);
    var within = pairs.filter(function (p) { return p[0].org === p[1].org && p[0].clues.length; });
    var cross = pairs.filter(function (p) { return within.indexOf(p) < 0; });
    var qW = [], qC = [], out = [], last = {}, yesterday = {};
    function key(p) { return p[0].id + "|" + p[1].id; }
    for (var d = 0; d <= Math.max(0, day); d++) {
      var used = {}, orgs = {}; out = [];
      function rested(p) { return !yesterday[p[0].id] && !yesterday[p[1].id]; } // no card from the day before
      var grab = function (q, src, pred, n, gap) {
        for (var pass = 0; pass < 4 && n > 0; pass++) {
          // Refill with a new shuffled cycle, without pairs that are still waiting in the queue.
          if (pass > 0 || q.length < n) {
            var waiting = {}; q.forEach(function (p) { waiting[key(p)] = 1; });
            Array.prototype.push.apply(q, shuffle(src.filter(function (p) { return !waiting[key(p)]; }), r));
          }
          var g = pass < 2 ? gap : 1; // pass 2 relaxes the gap; pass 3 also relaxes the rest rule, so a day is never short
          for (var k = 0; k < q.length && n > 0; k++) {
            var p = q[k];
            if (used[p[0].id] || used[p[1].id] || !pred(p) || (pass < 3 && !rested(p)) || d - (last[key(p)] == null ? -1e9 : last[key(p)]) < g) continue;
            q.splice(k--, 1); n--; used[p[0].id] = used[p[1].id] = true; orgs[p[0].org] = 1; last[key(p)] = d;
            out.push(r() < 0.5 ? [p[0], p[1]] : [p[1], p[0]]);
          }
        }
      };
      grab(qW, within, function (p) { return !orgs[p[0].org]; }, CFG.withinRounds, 14);
      grab(qC, cross, function () { return true; }, CFG.rounds - out.length, 21);
      yesterday = used;
    }
    return out;
  }

  function load() { var s; try { s = JSON.parse(localStorage.getItem(CFG.storageKey)); } catch (e) {} s = s || {}; s.days = s.days || {}; s.streak = s.streak || 0; if (s.lastDay == null) s.lastDay = -99; return s; }
  function save(s) { try { localStorage.setItem(CFG.storageKey, JSON.stringify(s)); } catch (e) {} }
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function mount(root, deck) {
    var day = dayIndex(CFG.startDate), rounds = buildRounds(deck.items, day), bar = deck.bar.value;
    var store = load(), st = store.days[day] || (store.days[day] = { picks: [], done: false });
    var lo = Math.log(2), hi = Math.log(100);
    function pos(v) { return Math.max(0, Math.min(100, (Math.log(v) - lo) / (hi - lo) * 100)); }

    root.classList.add("gv"); root.innerHTML = "";
    var head = h("div", "dv-head");
    var meta = h("div", "dv-meta"); meta.appendChild(h("span", null, CFG.name + " #" + (day + 1)));
    var streakEl = h("span", "dv-streak"); meta.appendChild(streakEl);
    var help = h("button", "dv-help", "How to play"); help.type = "button"; meta.appendChild(help);
    head.appendChild(meta); root.appendChild(head);

    var dots = h("div", "gw-dots"); root.appendChild(dots);
    var stage = h("div", "gw-stage"); root.appendChild(stage);
    var live = h("div", "gw-sr"); live.setAttribute("aria-live", "polite"); root.appendChild(live);

    function correct(i) { var p = rounds[i]; return p[0].value > p[1].value ? 0 : 1; }
    function renderStreak() { var n = store.lastDay >= day - 1 ? store.streak : 0; streakEl.textContent = "Streak " + n; }
    function renderDots() {
      dots.innerHTML = "";
      rounds.forEach(function (_, i) {
        var d = h("span", "gw-dot"); var pk = st.picks[i];
        if (pk != null) d.dataset.s = pk === correct(i) ? "hit" : "miss";
        if (i === st.picks.length && !st.done) d.classList.add("is-now");
        dots.appendChild(d);
      });
    }

    function card(it, revealed, state, onPick) {
      var c = h(revealed ? "div" : "button", "gw-card"); if (!revealed) { c.type = "button"; c.addEventListener("click", onPick); }
      if (state) c.dataset.s = state;
      var top = h("div", "gw-top"); top.appendChild(h("span", "gw-icon", it.icon));
      var t = h("div"); t.appendChild(h("div", "gw-prog", it.program)); t.appendChild(h("div", "gw-org", it.org)); top.appendChild(t); c.appendChild(top);
      c.appendChild(h("div", "gw-place", it.place));
      if (it.clues.length) { var ul = h("dl", "gw-clues"); it.clues.forEach(function (k) { ul.appendChild(h("dt", null, k.label)); ul.appendChild(h("dd", null, k.value)); }); c.appendChild(ul); }
      if (revealed) {
        var v = h("div", "gw-val", fmt(it)); c.appendChild(v);
        var track = h("div", "gw-track"); var fill = h("div", "gw-fill"); fill.style.width = pos(it.value) + "%"; track.appendChild(fill);
        var line = h("div", "gw-bar"); line.style.left = pos(bar) + "%"; line.title = "GiveWell's bar: " + bar + "×"; track.appendChild(line); c.appendChild(track);
      }
      return c;
    }

    function renderRound() {
      stage.innerHTML = "";
      var i = st.picks.length, answered = false;
      if (st.done) return renderEnd();
      var p = rounds[i];
      stage.appendChild(h("p", "gw-q", "Where does a dollar do more good?"));
      var pair = h("div", "gw-pair");
      [0, 1].forEach(function (k) {
        pair.appendChild(card(p[k], false, null, function () { if (answered) return; answered = true; pick(k); }));
        if (k === 0) pair.appendChild(h("div", "gw-vs", "or"));
      });
      stage.appendChild(pair);
    }

    function pick(k) {
      var i = st.picks.length, p = rounds[i], ok = k === correct(i);
      st.picks.push(k);
      if (st.picks.length === rounds.length) {
        st.done = true;
        var score = st.picks.filter(function (x, j) { return x === correct(j); }).length;
        st.score = score;
        if (score >= 4) { store.streak = store.lastDay === day - 1 ? store.streak + 1 : 1; store.lastDay = day; } else { store.streak = 0; store.lastDay = -99; }
      }
      save(store); renderDots(); renderStreak();
      stage.innerHTML = "";
      stage.appendChild(h("p", "gw-q gw-verdict", ok ? "Correct" : "Not quite"));
      var pair = h("div", "gw-pair");
      [0, 1].forEach(function (j) {
        pair.appendChild(card(p[j], true, j === correct(i) ? "hit" : (j === k ? "miss" : null)));
        if (j === 0) pair.appendChild(h("div", "gw-vs", "or"));
      });
      stage.appendChild(pair);
      var w = p[correct(i)], l = p[1 - correct(i)];
      stage.appendChild(h("p", "gw-note", w.place + " is about " + (ratio(w, l) < 10 ? ratio(w, l).toFixed(1) : Math.round(ratio(w, l))) + " times as cost-effective as " + l.place + " in GiveWell's model. The line on each bar is GiveWell's funding bar (" + bar + "×)."));
      live.textContent = (ok ? "Correct. " : "Incorrect. ") + w.org + ", " + w.place + ": " + fmt(w) + ". " + l.org + ", " + l.place + ": " + fmt(l) + ".";
      var next = h("button", "dv-go gw-next", st.done ? "See results" : "Next round"); next.type = "button";
      next.addEventListener("click", renderRound); stage.appendChild(next); next.focus({ preventScroll: true });
    }

    function renderEnd() {
      stage.innerHTML = "";
      var score = st.score != null ? st.score : st.picks.filter(function (x, j) { return x === correct(j); }).length;
      stage.appendChild(h("p", "dv-verdict", score + " of " + rounds.length + " correct"));
      stage.appendChild(h("p", "gw-note", "Today's estimates, in multiples of GiveWell's benchmark (log scale). The line is GiveWell's funding bar."));
      var all = []; rounds.forEach(function (p) { all.push(p[0], p[1]); });
      all.sort(function (a, b) { return b.value - a.value; });
      var chart = h("div", "gw-chart");
      all.forEach(function (it) {
        var row = h("div", "gw-row");
        row.appendChild(h("span", "gw-rlabel", it.icon + " " + (it.short || it.org) + " · " + it.place));
        var tr = h("div", "gw-track"); var f = h("div", "gw-fill"); f.style.width = pos(it.value) + "%"; tr.appendChild(f);
        var ln = h("div", "gw-bar"); ln.style.left = pos(bar) + "%"; tr.appendChild(ln); row.appendChild(tr);
        row.appendChild(h("span", "gw-rval", fmt(it))); chart.appendChild(row);
      });
      stage.appendChild(chart);
      stage.appendChild(h("p", "gw-fine", "GiveWell calls these estimates extremely rough and warns against reading them literally. Values: GiveWell's November 2025 models. Bar: May 2026. " + CFG.name + " is an independent project, not affiliated with GiveWell."));
      var src = h("p", "gw-fine"); var a = h("a", null, "GiveWell's cost-effectiveness analyses"); a.href = deck.bar.source; a.target = "_blank"; a.rel = "noopener"; src.appendChild(document.createTextNode("Source: ")); src.appendChild(a); stage.appendChild(src);
      var foot = h("div", "dv-foot"); var nx = h("span", "dv-next"); foot.appendChild(nx);
      var sh = h("button", "dv-share", "Share"); sh.type = "button";
      sh.addEventListener("click", function () {
        var txt = CFG.name + " #" + (day + 1) + " " + score + "/" + rounds.length + "\n" + st.picks.map(function (x, j) { return x === correct(j) ? "🟩" : "⬜"; }).join("") + "\n" + CFG.shareUrl;
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { sh.textContent = "Copied"; }, function () {});
      });
      foot.appendChild(sh); stage.appendChild(foot);
      var tick = function () { var n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); var s = Math.floor((m - n) / 1000), z = function (x) { return String(x).padStart(2, "0"); }; nx.textContent = "Next " + CFG.name + " in " + z(Math.floor(s / 3600)) + ":" + z(Math.floor(s / 60) % 60) + ":" + z(s % 60); };
      tick(); setInterval(tick, 1000);
    }

    var dlg = h("dialog", "dv-dialog");
    dlg.appendChild(h("h2", null, "How to play"));
    dlg.appendChild(h("p", null, "Each round shows two real programs that GiveWell funds, each in a specific place. Select the one where a dollar does more good, according to GiveWell's cost-effectiveness model."));
    dlg.appendChild(h("p", null, "The clues on the cards are inputs from the same model. They show what drives the difference, for example how many children would be reached anyway."));
    dlg.appendChild(h("p", null, "Five rounds a day. Get 4 or more right to keep your streak."));
    dlg.appendChild(h("p", "gw-fine", "An independent project. Not affiliated with or endorsed by GiveWell."));
    var cl = h("button", "dv-go dv-close", "Play"); cl.type = "button"; cl.addEventListener("click", function () { dlg.close(); }); dlg.appendChild(cl);
    root.appendChild(dlg); help.addEventListener("click", function () { dlg.showModal(); });

    renderStreak(); renderDots(); renderRound();
    if (!store.seenHelp) { store.seenHelp = true; save(store); dlg.showModal(); }
  }

  window.Givedle = { mount: mount, _test: { buildRounds: buildRounds, ratio: ratio } };
  function auto() { var r = document.getElementById("givedle"); if (r && window.GIVEWELL_DECK) mount(r, window.GIVEWELL_DECK); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
})();
