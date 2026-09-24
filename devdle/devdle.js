/* DEVdle — a daily development-economics guessing game.
 * Usage: <div id="devdle"></div> + interventions.js + this file.
 * Optional: window.DEVDLE_CONFIG = { ... } to override data.config.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    maxGuesses: 6,
    startDate: "2026-09-23",
    seed: 1,
    storageKey: "devdle:v1",
    shareUrl: "aadhavrajesh.com",
    feedback: []
  };
  var EMOJI = { hit: "🟩", near: "🟨", miss: "⬜" };
  var WORDS = { hit: "match", near: "same family", miss: "different" };

  /* ---------- pure helpers (exported for tests) ---------- */
  function dayIndex(startDate, now) {
    now = now || new Date();
    var p = startDate.split("-").map(Number);
    var start = Date.UTC(p[0], p[1] - 1, p[2]);
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - start) / 86400000);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seed) {
    var a = arr.slice(), r = mulberry32(seed);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function asArray(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  // hit = same value(s); near = overlap or same family; miss = neither
  function compare(key, guess, answer, taxonomy) {
    var g = asArray(guess[key]), a = asArray(answer[key]);
    if (g.length === a.length && g.every(function (v) { return a.indexOf(v) > -1; })) return "hit";
    if (g.some(function (v) { return a.indexOf(v) > -1; })) return "near";
    var fam = taxonomy[key] || {};
    var gf = g.map(function (v) { return fam[v]; }).filter(Boolean);
    if (a.some(function (v) { return fam[v] && gf.indexOf(fam[v]) > -1; })) return "near";
    return "miss";
  }
  function pickAnswer(items, cfg, day) {
    var pool = items.filter(function (d) { return d.in_answer_pool !== false; })
      .map(function (d) { return d.id; }).sort();
    var order = seededShuffle(pool, cfg.seed);
    return order[((day % order.length) + order.length) % order.length];
  }

  /* ---------- storage ---------- */
  function load(key) {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(key)); } catch (e) { /* storage blocked */ }
    s = s || {};
    s.boards = s.boards || {};
    s.dist = s.dist || [0, 0, 0, 0, 0, 0, 0];
    s.streak = s.streak || 0; s.maxStreak = s.maxStreak || 0;
    s.played = s.played || 0; s.wins = s.wins || 0;
    if (s.lastWinDay == null) s.lastWinDay = -99;
    return s;
  }
  function save(key, s) {
    var days = Object.keys(s.boards).map(Number).sort(function (a, b) { return b - a; });
    days.slice(30).forEach(function (d) { delete s.boards[d]; });
    try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  /* ---------- DOM helper ---------- */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- the game ---------- */
  function mount(root, data, overrides) {
    var cfg = Object.assign({}, DEFAULTS, data.config || {}, overrides || {});
    var fields = cfg.feedback;
    var taxonomy = data.taxonomy || {};
    var items = data.interventions.filter(function (d) { return d.status !== "hidden"; });
    var byId = {};
    items.forEach(function (d) { byId[d.id] = d; });

    var day = dayIndex(cfg.startDate);
    var answer = byId[pickAnswer(items, cfg, day)];
    var store = load(cfg.storageKey);
    var board = store.boards[day] || (store.boards[day] = { guesses: [], done: false, won: false });
    var pending = null, revealRow = -1, winRow = -1, suppressClick = false, timer = null;

    root.classList.add("devdle");
    root.style.setProperty("--dv-n", fields.length);
    root.innerHTML = "";

    // header
    var head = h("div", "dv-head");
    head.appendChild(h("h2", "dv-title", "DEVdle"));
    var meta = h("div", "dv-meta");
    meta.appendChild(h("span", null, "#" + (day + 1)));
    var streakEl = h("span", "dv-streak");
    meta.appendChild(streakEl);
    var helpBtn = h("button", "dv-help", "?");
    helpBtn.type = "button"; helpBtn.setAttribute("aria-label", "How to play");
    meta.appendChild(helpBtn);
    head.appendChild(meta);
    root.appendChild(head);

    // board
    var boardEl = h("div", "dv-board");
    boardEl.setAttribute("role", "grid");
    boardEl.setAttribute("aria-label", "Guesses");
    root.appendChild(boardEl);
    var live = h("div"); live.setAttribute("aria-live", "polite");
    live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
    root.appendChild(live);

    // actions
    var actions = h("div", "dv-actions");
    var goBtn = h("button", "dv-go", "Guess"); goBtn.type = "button";
    actions.appendChild(goBtn);
    root.appendChild(actions);

    // deck
    var search = null;
    if (items.length > 20) {
      search = h("input", "dv-search");
      search.type = "search"; search.placeholder = "Find an intervention";
      search.setAttribute("aria-label", "Find an intervention");
      root.appendChild(search);
    }
    var deck = h("div", "dv-deck");
    root.appendChild(deck);

    // result
    var result = h("section", "dv-result"); result.hidden = true;
    root.appendChild(result);

    var toast = h("div", "dv-toast"); root.appendChild(toast);

    /* ---- rendering ---- */
    function renderStreak() {
      var n = store.lastWinDay >= day - 1 ? store.streak : 0;
      streakEl.textContent = "Streak " + n;
      streakEl.dataset.live = n > 0 ? "true" : "false";
    }

    function nameCell(item, extra) {
      var c = h("div", "dv-name" + (extra ? " " + extra : ""));
      if (item) {
        c.appendChild(h("span", "dv-icon", item.icon || "•"));
        c.appendChild(h("span", null, item.short_name || item.name));
      }
      return c;
    }

    function renderBoard() {
      boardEl.innerHTML = "";
      var cols = h("div", "dv-cols");
      cols.appendChild(h("span", null, "Intervention"));
      fields.forEach(function (f) { cols.appendChild(h("span", null, f.label)); });
      boardEl.appendChild(cols);

      for (var r = 0; r < cfg.maxGuesses; r++) {
        var row = h("div", "dv-row"); row.setAttribute("role", "row");
        var gid = board.guesses[r];
        if (gid) {
          var g = byId[gid] || { short_name: "?", icon: "?" };
          row.appendChild(nameCell(g));
          fields.forEach(function (f, i) {
            var s = compare(f.key, g, answer, taxonomy);
            var t = h("div", "dv-tile" + (r === revealRow ? " flip" : ""), asArray(g[f.key]).join(", "));
            t.dataset.s = s; t.style.setProperty("--i", i); t.setAttribute("role", "gridcell");
            var fam = (taxonomy[f.key] || {})[asArray(g[f.key])[0]];
            t.title = s === "near" && fam ? "Same family: " + fam : s === "hit" ? "Exact match" : "Different";
            t.setAttribute("aria-label", f.label + ": " + t.textContent + ", " + WORDS[s]);
            row.appendChild(t);
          });
          if (r === winRow) row.classList.add("win");
        } else if (r === board.guesses.length && !board.done) {
          row.classList.add("is-active");
          var slot = pending ? nameCell(byId[pending], "has-card pop") : nameCell(null);
          if (!pending) slot.appendChild(h("span", null, matchMedia("(pointer: fine)").matches ? "Drag or click a card" : "Tap a card"));
          slot.dataset.slot = "1";
          row.appendChild(slot);
          fields.forEach(function () { row.appendChild(h("div", "dv-tile")); });
        } else {
          row.appendChild(nameCell(null));
          fields.forEach(function () { row.appendChild(h("div", "dv-tile")); });
        }
        boardEl.appendChild(row);
      }
      goBtn.disabled = !pending || board.done;
      actions.style.display = board.done ? "none" : "";
    }

    function renderDeck() {
      deck.innerHTML = "";
      var q = search ? search.value.trim().toLowerCase() : "";
      items.slice().sort(function (a, b) { return (a.short_name || a.name).localeCompare(b.short_name || b.name); })
        .filter(function (d) { return !q || (d.name + " " + (d.short_name || "")).toLowerCase().indexOf(q) > -1; })
        .forEach(function (d) {
          var c = h("button", "dv-card" + (d.id === pending ? " is-picked" : ""));
          c.type = "button"; c.dataset.id = d.id;
          c.appendChild(h("span", "dv-icon", d.icon || "•"));
          c.appendChild(h("span", null, d.short_name || d.name));
          c.title = d.name;
          c.disabled = board.done || board.guesses.indexOf(d.id) > -1;
          wire(c, d.id);
          deck.appendChild(c);
        });
      deck.hidden = board.done;
      if (search) search.hidden = board.done;
    }

    function shareText() {
      var n = board.won ? board.guesses.length : "X";
      var lines = ["DEVdle #" + (day + 1) + " " + n + "/" + cfg.maxGuesses];
      board.guesses.forEach(function (id) {
        lines.push(fields.map(function (f) { return EMOJI[compare(f.key, byId[id], answer, taxonomy)]; }).join(""));
      });
      lines.push(cfg.shareUrl);
      return lines.join("\n");
    }

    function renderResult() {
      result.innerHTML = "";
      if (!board.done) { result.hidden = true; return; }
      var n = board.guesses.length;
      result.appendChild(h("p", "dv-verdict", board.won ? "Solved in " + n + " of " + cfg.maxGuesses : "The answer was"));
      var a = h("div", "dv-answer");
      a.appendChild(h("div", "dv-big", answer.icon || ""));
      a.appendChild(h("h3", null, answer.name));
      if (answer.description) a.appendChild(h("p", null, answer.description));
      if (answer.why_it_works) a.appendChild(h("p", "dv-why", answer.why_it_works));
      if (answer.givewell_status) {
        var gw = "GiveWell status: " + answer.givewell_status + (answer.givewell_review_updated ? " (review updated " + answer.givewell_review_updated + ")" : "") + ".";
        if (answer.givewell_view) gw += " " + answer.givewell_view;
        a.appendChild(h("p", "dv-why", gw));
      }
      result.appendChild(a);
      if (answer.sources && answer.sources.length) {
        var ul = h("ul", "dv-sources");
        answer.sources.forEach(function (s) {
          var li = h("li");
          var label = (s.org ? s.org + ": " : "") + (s.title || "");
          if (s.url) { var link = h("a", null, label); link.href = s.url; link.target = "_blank"; link.rel = "noopener"; li.appendChild(link); }
          else li.textContent = label;
          ul.appendChild(li);
        });
        result.appendChild(ul);
      }
      if (answer.status === "draft") result.appendChild(h("p", "dv-draft", "Draft entry. Details are still being checked against the sources."));

      var foot = h("div", "dv-foot");
      var next = h("span", "dv-next"); foot.appendChild(next);
      var share = h("button", "dv-share", "Share"); share.type = "button";
      share.addEventListener("click", function () {
        var txt = shareText();
        var done = function () { flash("Copied to clipboard"); };
        if (navigator.share && matchMedia("(pointer: coarse)").matches) {
          navigator.share({ text: txt }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
        } else { fallbackCopy(txt); done(); }
      });
      foot.appendChild(share);
      result.appendChild(foot);
      result.hidden = false;

      clearInterval(timer);
      var tick = function () {
        var now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
        var s = Math.max(0, Math.floor((mid - now) / 1000));
        var pad = function (x) { return String(x).padStart(2, "0"); };
        next.textContent = "Next DEVdle in " + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
        if (s === 0) { clearInterval(timer); mount(root, data, overrides); }
      };
      tick(); timer = setInterval(tick, 1000);
    }

    function fallbackCopy(txt) {
      var ta = document.createElement("textarea"); ta.value = txt;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      ta.remove();
    }

    function flash(msg) {
      toast.textContent = msg; toast.classList.add("is-on");
      setTimeout(function () { toast.classList.remove("is-on"); }, 1400);
    }

    function renderAll() { renderStreak(); renderBoard(); renderDeck(); renderResult(); }

    /* ---- actions ---- */
    function place(id) {
      if (board.done || board.guesses.indexOf(id) > -1) return;
      pending = id; revealRow = -1;
      renderBoard(); renderDeck();
      goBtn.focus({ preventScroll: true });
    }

    function submit() {
      if (board.done) return;
      if (!pending) {
        var active = boardEl.querySelector(".is-active");
        if (active) { active.classList.remove("shake"); void active.offsetWidth; active.classList.add("shake"); }
        return;
      }
      board.guesses.push(pending);
      revealRow = board.guesses.length - 1;
      var won = pending === answer.id;
      pending = null;
      if (won || board.guesses.length >= cfg.maxGuesses) {
        board.done = true; board.won = won;
        store.played++;
        if (won) {
          store.wins++; store.dist[board.guesses.length - 1]++;
          store.streak = store.lastWinDay === day - 1 ? store.streak + 1 : 1;
          store.lastWinDay = day;
          store.maxStreak = Math.max(store.maxStreak, store.streak);
        } else { store.dist[6]++; store.streak = 0; store.lastWinDay = -99; }
      }
      save(cfg.storageKey, store);
      renderStreak(); renderBoard(); renderDeck();
      var g = byId[board.guesses[revealRow]];
      live.textContent = g.short_name + ": " + fields.map(function (f) {
        return f.label + " " + WORDS[compare(f.key, g, answer, taxonomy)];
      }).join(", ");

      var delay = fields.length * 190 + 560;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) delay = 0;
      if (board.done) {
        setTimeout(function () {
          if (board.won) { winRow = revealRow; revealRow = -1; renderBoard(); }
          setTimeout(renderResult, board.won ? 700 : 150);
        }, delay);
      }
    }

    /* ---- input: click / tap / keyboard, plus mouse drag ---- */
    function wire(card, id) {
      card.addEventListener("click", function () {
        if (suppressClick) { suppressClick = false; return; }
        place(id);
      });
      card.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "touch" || card.disabled || e.button !== 0) return;
        var sx = e.clientX, sy = e.clientY, ghost = null;
        function slotAt(x, y) {
          var t = document.elementFromPoint(x, y);
          return t && t.closest && t.closest(".devdle [data-slot]");
        }
        function move(ev) {
          if (!ghost) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
            ghost = card.cloneNode(true); ghost.classList.add("dv-ghost");
            ghost.style.width = card.offsetWidth + "px";
            root.appendChild(ghost);
          }
          ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px";
          var s = slotAt(ev.clientX, ev.clientY);
          boardEl.querySelectorAll("[data-slot]").forEach(function (n) { n.classList.toggle("is-over", n === s); });
        }
        function up(ev) {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          if (!ghost) return;
          ghost.remove(); suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 0);
          if (slotAt(ev.clientX, ev.clientY)) place(id);
          else boardEl.querySelectorAll("[data-slot]").forEach(function (n) { n.classList.remove("is-over"); });
        }
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      });
    }

    goBtn.addEventListener("click", submit);
    if (search) search.addEventListener("input", renderDeck);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && pending && e.target === goBtn) return; // button handles it
      if (e.key === "Enter" && pending && !(e.target.classList && e.target.classList.contains("dv-card"))) { e.preventDefault(); submit(); }
    });

    /* ---- help ---- */
    var dlg = h("dialog", "dv-dialog");
    dlg.appendChild(h("h2", null, "How to play"));
    dlg.appendChild(h("p", null, "Find the hidden development intervention in " + cfg.maxGuesses + " guesses. A new one appears each day."));
    dlg.appendChild(h("p", null, "Drag a card into the empty row, or tap it. Then press Guess. Each tile compares one feature of your guess with the answer."));
    var key = h("div", "dv-key");
    [["hit", "Same as the answer"], ["near", "Different, but in the same family (for example, two kinds of prevention)"], ["miss", "Different family"]]
      .forEach(function (k) { var t = h("div", "dv-tile"); t.dataset.s = k[0]; key.appendChild(t); key.appendChild(h("span", null, k[1])); });
    dlg.appendChild(key);
    dlg.appendChild(h("p", null, "Hover a yellow tile to see the family it shares."));
    var close = h("button", "dv-go dv-close", "Play"); close.type = "button";
    close.addEventListener("click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
    dlg.appendChild(close);
    root.appendChild(dlg);
    function openHelp() { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    helpBtn.addEventListener("click", openHelp);

    renderAll();
    if (!store.seenHelp) { store.seenHelp = true; save(cfg.storageKey, store); openHelp(); }
  }

  window.DEVdle = { mount: mount, _test: { compare: compare, dayIndex: dayIndex, pickAnswer: pickAnswer, seededShuffle: seededShuffle } };

  function auto() {
    var root = document.getElementById("devdle");
    if (root && window.DEVDLE_DATA) mount(root, window.DEVDLE_DATA, window.DEVDLE_CONFIG);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
})();
