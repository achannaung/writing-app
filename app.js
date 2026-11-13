(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var LS = {
    draft: "writingApp.draft.v1",
    phrases: "writingApp.phrases.v1",
    history: "writingApp.history.v1",
    seedVersion: "writingApp.seedVersion.v1",
    removedSeeds: "writingApp.removedSeeds.v1"
  };

  var HISTORY_LIMIT = 30;
  var RECENT_PREVIEW = 3;
  var PHRASE_PREVIEW = 50;
  var SUGGESTION_LIMIT = 5;
  var MAX_PHRASE_LENGTH = 200;

  // Renames applied to lists created by older versions, so updates do not
  // leave duplicate misspellings behind.
  var SEED_MIGRATIONS = {
    2: {
      rename: {
        "Aungmy\u200caythazan Township (Mandalay Region)": "Aungmyaythazan Township (Mandalay Region)",
        "thantlang Township (Chin State)": "Thantlang Township (Chin State)",
        "Langhko Township (Southern Shan State)": "Langkho Township (Southern Shan State)",
        "Ywarthit Town (Bawlake Township, Kayah State)": "Ywarthit Town (Bawlakhe Township, Kayah State)",
        "Mawlamyaing Township (Mon State)": "Mawlamyine Township (Mon State)",
        "aridropped some packages of rations and ammunition": "airdropped some packages of rations and ammunition",
        "pro-military media reported that ": "pro-military media reported that"
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * Elements
   * ------------------------------------------------------------------ */

  var editor = document.getElementById("editor");
  var suggestBar = document.getElementById("suggest-bar");
  var suggestStatus = document.getElementById("suggest-status");
  var wordcount = document.getElementById("wordcount");
  var themeToggle = document.getElementById("theme-toggle");
  var phraseInput = document.getElementById("phrase-input");
  var phraseError = document.getElementById("phrase-error");
  var phraseFilterInput = document.getElementById("phrase-filter");
  var phraseCount = document.getElementById("phrase-count");
  var phraseList = document.getElementById("phrase-list");
  var phraseMore = document.getElementById("phrase-more");
  var historyList = document.getElementById("history-list");
  var historyMore = document.getElementById("history-more");
  var storageStatus = document.getElementById("storage-status");
  var alertBox = document.getElementById("alert");
  var alertText = document.getElementById("alert-text");
  var alertExport = document.getElementById("alert-export");
  var saveBtn = document.getElementById("save-btn");
  var copyBtn = document.getElementById("copy-btn");
  var clearBtn = document.getElementById("clear-btn");
  var downloadBtn = document.getElementById("download-btn");
  var backupBtn = document.getElementById("backup-btn");
  var restoreBtn = document.getElementById("restore-btn");
  var restoreFile = document.getElementById("restore-file");

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function byLower(list) {
    var map = Object.create(null);
    list.forEach(function (item) { map[item.toLowerCase()] = true; });
    return map;
  }

  function uniqueByLower(list) {
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (item) {
      var key = item.toLowerCase();
      if (!seen[key]) { seen[key] = true; out.push(item); }
    });
    return out;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function timeNow() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function fileStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes());
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return ""; }
  }

  function newId() {
    return Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  // Buttons carry an optional <span class="btn-label"> so the icon or chip
  // around the text survives a label change.
  function labelNode(btn) {
    return btn.querySelector(".btn-label") || btn;
  }

  function setLabel(btn, label) {
    labelNode(btn).textContent = label;
  }

  function flashButton(btn, label) {
    var node = labelNode(btn);
    if (!node.dataset.original) node.dataset.original = node.textContent;
    node.textContent = label;
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(function () {
      node.textContent = node.dataset.original;
    }, 1200);
  }

  /* ------------------------------------------------------------------ *
   * Storage (all failures are visible to the user)
   * ------------------------------------------------------------------ */

  var storageAvailable = (function () {
    try {
      var key = "__writingAppProbe__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (e) { return false; }
  })();

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (e) {
      var full = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
      return {
        ok: false,
        message: full
          ? "Browser storage is full. Download a backup now, then delete old entries."
          : "This browser is blocking local storage. Export your work to avoid losing it."
      };
    }
  }

  function showAlert(message) {
    alertText.textContent = message;
    alertBox.hidden = false;
  }

  function hideAlert() { alertBox.hidden = true; }

  function persist(key, value) {
    var result = write(key, value);
    if (!result.ok) showAlert(result.message);
    else hideAlert();
    return result.ok;
  }

  function setStatus(message, kind) {
    storageStatus.textContent = message;
    storageStatus.className = "status" + (kind ? " " + kind : "");
  }

  /* ------------------------------------------------------------------ *
   * Seed data
   * ------------------------------------------------------------------ */

  var seedVersion = 1;
  var seeds = [];

  (function loadSeedData() {
    var el = document.getElementById("seed-data");
    if (!el) return;
    try {
      var data = JSON.parse(el.textContent || "");
      if (data && typeof data.version === "number") seedVersion = data.version;
      if (data && Array.isArray(data.phrases)) {
        seeds = data.phrases
          .filter(function (p) { return p && typeof p.text === "string" && p.text.trim(); })
          .map(function (p) {
            return {
              text: p.text,
              trigger: typeof p.trigger === "string" ? p.trigger.toLowerCase() : ""
            };
          });
      }
    } catch (e) { seeds = []; }
  })();

  /* ------------------------------------------------------------------ *
   * Phrases: load, merge new seeds, keep deletions deleted
   * ------------------------------------------------------------------ */

  var removedSeeds = read(LS.removedSeeds, []);
  if (!Array.isArray(removedSeeds)) removedSeeds = [];
  removedSeeds = removedSeeds.filter(function (s) { return typeof s === "string" && s.trim(); });
  var removedSet = byLower(removedSeeds);

  var phrases = read(LS.phrases, null);
  var initNotice = "";

  function applySeedMigrations(fromVersion) {
    var changed = false;
    for (var version = fromVersion + 1; version <= seedVersion; version += 1) {
      var migration = SEED_MIGRATIONS[version];
      if (!migration || !migration.rename) continue;
      var rename = migration.rename;
      phrases = phrases.map(function (text) {
        if (rename[text]) { changed = true; return rename[text]; }
        return text;
      });
      removedSeeds = removedSeeds.map(function (text) {
        if (rename[text]) { changed = true; return rename[text]; }
        return text;
      });
    }
    if (changed) {
      phrases = uniqueByLower(phrases);
      removedSeeds = uniqueByLower(removedSeeds);
      removedSet = byLower(removedSeeds);
    }
    return changed;
  }

  if (!Array.isArray(phrases)) {
    phrases = uniqueByLower(
      seeds.map(function (s) { return s.text; })
        .filter(function (text) { return !removedSet[text.toLowerCase()]; })
    );
    persist(LS.phrases, phrases);
    persist(LS.seedVersion, seedVersion);
  } else {
    phrases = uniqueByLower(phrases.filter(function (s) {
      return typeof s === "string" && s.trim() && s.length <= 400;
    }));

    var appliedVersion = Number(read(LS.seedVersion, 0)) || 0;
    var added = 0;
    if (appliedVersion < seedVersion) {
      applySeedMigrations(appliedVersion);

      var present = byLower(phrases);
      seeds.forEach(function (seed) {
        var key = seed.text.toLowerCase();
        if (present[key] || removedSet[key]) return;
        phrases.push(seed.text);
        present[key] = true;
        added += 1;
      });
      persist(LS.phrases, phrases);
      persist(LS.removedSeeds, removedSeeds);
      persist(LS.seedVersion, seedVersion);
    }
    if (added) {
      initNotice = "Added " + added + " new auto text " + (added === 1 ? "item" : "items") + ".";
    }
  }

  /* ------------------------------------------------------------------ *
   * History
   * ------------------------------------------------------------------ */

  function sanitizeHistory(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    value.forEach(function (entry) {
      if (!entry || typeof entry !== "object") return;
      if (typeof entry.text !== "string" || !entry.text.trim()) return;
      out.push({
        id: entry.id == null ? newId() : String(entry.id),
        text: entry.text,
        date: typeof entry.date === "string" ? entry.date : new Date().toISOString()
      });
    });
    return out.slice(0, HISTORY_LIMIT);
  }

  var history = sanitizeHistory(read(LS.history, []));

  /* ------------------------------------------------------------------ *
   * Suggestion index
   * ------------------------------------------------------------------ */

  var phraseIndex = [];
  var triggerIndex = [];

  function rebuildIndex() {
    phraseIndex = phrases.map(function (text) {
      return { text: text, lower: text.toLowerCase() };
    });

    var present = Object.create(null);
    phrases.forEach(function (text) { present[text] = true; });

    triggerIndex = seeds
      .filter(function (seed) { return seed.trigger && seed.trigger.length > 1 && present[seed.text]; })
      .map(function (seed) { return { text: seed.text, trigger: seed.trigger }; })
      .sort(function (a, b) { return a.trigger < b.trigger ? -1 : a.trigger > b.trigger ? 1 : 0; });
  }

  rebuildIndex();

  /* ------------------------------------------------------------------ *
   * Word and character count
   * ------------------------------------------------------------------ */

  var segmenter = null;
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try { segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" }); } catch (e) { segmenter = null; }
  }

  function countCharacters(text) {
    if (!text) return 0;
    if (segmenter) {
      var count = 0;
      var iterator = segmenter.segment(text);
      for (var part of iterator) { count += 1; }
      return count;
    }
    return Array.from(text).length;
  }

  function updateCount() {
    var text = editor.value;
    var trimmed = text.trim();
    var words = trimmed ? trimmed.split(/\s+/).length : 0;
    var characters = countCharacters(text);
    wordcount.textContent =
      words + (words === 1 ? " word" : " words") + " · " +
      characters + (characters === 1 ? " character" : " characters");
    wordcount.title = "Words are separated by spaces. Burmese text is measured more accurately by characters.";
  }

  /* ------------------------------------------------------------------ *
   * Draft autosave (debounced, flushed before leaving)
   * ------------------------------------------------------------------ */

  var draftTimer = null;

  function flushDraft() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    var result = write(LS.draft, editor.value);
    if (result.ok) {
      setStatus("Saved in this browser · " + timeNow());
    } else {
      setStatus("Not saved.", "error");
      showAlert(result.message);
    }
  }

  function scheduleDraftSave() {
    setStatus("Saving…");
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 300);
  }

  /* ------------------------------------------------------------------ *
   * Auto-text suggestions
   * ------------------------------------------------------------------ */

  var composing = false;
  var currentMatches = [];
  var SUGGEST_TAIL = 400;

  function lastToken(text) {
    var match = text.match(/(\S+)$/);
    return match ? match[1] : "";
  }

  function hideSuggestions() {
    currentMatches = [];
    suggestBar.hidden = true;
    suggestBar.replaceChildren();
    suggestStatus.textContent = "";
  }

  // The typed text is the start of the shortcut, e.g. "pro-res" for "pro-res/".
  function triggerPrefixLength(beforeLower, trigger) {
    var max = Math.min(beforeLower.length, trigger.length);
    for (var n = max; n >= 2; n -= 1) {
      if (beforeLower.slice(-n) !== trigger.slice(0, n)) continue;
      var startIndex = beforeLower.length - n;
      if (startIndex === 0 || /\s/.test(beforeLower.charAt(startIndex - 1))) return n;
    }
    return 0;
  }

  function findMatches(before) {
    var beforeLower = before.toLowerCase();
    var token = lastToken(before);
    var tokenLower = token.toLowerCase();
    var seen = Object.create(null);
    var triggerMatches = [];
    var phraseMatches = [];

    for (var i = 0; i < triggerIndex.length; i += 1) {
      var item = triggerIndex[i];
      var length = triggerPrefixLength(beforeLower, item.trigger);
      if (length >= 2 && !seen[item.text]) {
        seen[item.text] = true;
        triggerMatches.push({ text: item.text, trigger: item.trigger, replaceLength: length });
      }
    }

    // Longest, most specific shortcut wins, and shorter matches inside it are dropped.
    triggerMatches.sort(function (a, b) {
      return b.replaceLength - a.replaceLength || (a.trigger < b.trigger ? -1 : a.trigger > b.trigger ? 1 : 0);
    });
    var keptStart = -1;
    var triggers = [];
    triggerMatches.forEach(function (match) {
      var start = beforeLower.length - match.replaceLength;
      if (keptStart !== -1 && start > keptStart) return;
      keptStart = start;
      triggers.push(match);
    });

    if (token.length >= 2) {
      for (var j = 0; j < phraseIndex.length; j += 1) {
        var phrase = phraseIndex[j];
        if (phrase.lower.indexOf(tokenLower) === 0 && phrase.text.length > token.length && !seen[phrase.text]) {
          seen[phrase.text] = true;
          phraseMatches.push({ text: phrase.text, trigger: "", replaceLength: token.length });
        }
      }
    }

    return triggers.concat(phraseMatches).slice(0, SUGGESTION_LIMIT);
  }

  function renderSuggestions() {
    if (composing) return;
    if (editor.selectionStart !== editor.selectionEnd) { hideSuggestions(); return; }

    var position = editor.selectionStart;
    var before = editor.value.slice(Math.max(0, position - SUGGEST_TAIL), position);
    if (!before.trim()) { hideSuggestions(); return; }

    var matches = findMatches(before);
    if (!matches.length) { hideSuggestions(); return; }

    currentMatches = matches;
    suggestBar.replaceChildren();

    var label = document.createElement("span");
    label.className = "suggest-label";
    label.textContent = "Auto text";
    suggestBar.appendChild(label);

    matches.forEach(function (match) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "suggest-chip";
      chip.textContent = (match.trigger ? match.trigger + " \u2192 " : "") + match.text;
      chip.title = "Insert: " + match.text;
      chip.setAttribute("aria-label", "Insert " + match.text);
      chip.addEventListener("click", function () { insertPhrase(match); });
      suggestBar.appendChild(chip);
    });

    suggestBar.hidden = false;
    suggestStatus.textContent = matches.length +
      (matches.length === 1 ? " suggestion available. " : " suggestions available. ") +
      "Press Alt+1 to insert the first.";
  }

  function insertPhrase(match) {
    var end = editor.selectionEnd || 0;
    var start = (editor.selectionStart || 0) - (match.replaceLength || 0);
    if (start < 0) start = 0;

    var insert = /\s$/.test(match.text) ? match.text : match.text + " ";
    replaceRange(insert, start, end);
    hideSuggestions();
    editor.focus();
    afterEdit();
  }

  /* ------------------------------------------------------------------ *
   * Phrase list
   * ------------------------------------------------------------------ */

  var phraseFilter = "";
  var phraseShowAll = false;

  function setPhraseError(message) {
    phraseError.textContent = message || "";
    if (message) phraseInput.setAttribute("aria-invalid", "true");
    else phraseInput.removeAttribute("aria-invalid");
  }

  function deletePhrase(text) {
    var index = phrases.indexOf(text);
    if (index === -1) return;

    phrases.splice(index, 1);
    persist(LS.phrases, phrases);

    var seed = seeds.filter(function (s) { return s.text === text; })[0];
    if (seed) {
      var key = text.toLowerCase();
      if (!removedSet[key]) {
        removedSeeds.push(text);
        removedSet[key] = true;
        persist(LS.removedSeeds, removedSeeds);
      }
    }

    rebuildIndex();
    renderPhrases();
    renderSuggestions();
  }

  function phraseItem(text) {
    var li = document.createElement("li");
    li.className = "phrase-item";

    var span = document.createElement("span");
    span.className = "phrase-text";
    span.textContent = text;
    span.title = text;

    var del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn";
    del.textContent = "\u00d7";
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete auto text: " + text);
    del.addEventListener("click", function () { deletePhrase(text); });

    li.appendChild(span);
    li.appendChild(del);
    return li;
  }

  function emptyItem(message) {
    var li = document.createElement("li");
    li.className = "empty";
    li.textContent = message;
    return li;
  }

  function renderPhrases() {
    var filter = phraseFilter.trim().toLowerCase();
    var matches = filter
      ? phrases.filter(function (p) { return p.toLowerCase().indexOf(filter) !== -1; })
      : phrases;

    var visible = (filter || phraseShowAll) ? matches : matches.slice(0, PHRASE_PREVIEW);

    phraseList.replaceChildren();

    if (!phrases.length) {
      phraseList.appendChild(emptyItem("No auto text yet."));
      phraseCount.textContent = "";
      phraseMore.hidden = true;
      return;
    }

    if (!matches.length) {
      phraseList.appendChild(emptyItem("No auto text matches \u201c" + phraseFilter.trim() + "\u201d."));
    } else {
      var fragment = document.createDocumentFragment();
      visible.forEach(function (text) { fragment.appendChild(phraseItem(text)); });
      phraseList.appendChild(fragment);
    }

    phraseCount.textContent = filter
      ? matches.length + " of " + phrases.length
      : phrases.length + (phrases.length === 1 ? " item" : " items");

    if (!filter && matches.length > PHRASE_PREVIEW) {
      phraseMore.hidden = false;
      setLabel(phraseMore, phraseShowAll ? "Show fewer" : "Show all " + matches.length);
    } else {
      phraseMore.hidden = true;
    }
  }

  function addPhrase() {
    var value = phraseInput.value.trim();
    if (!value) return;

    if (value.length > MAX_PHRASE_LENGTH) {
      setPhraseError("Keep auto text under " + MAX_PHRASE_LENGTH + " characters.");
      return;
    }
    if (phrases.some(function (p) { return p.toLowerCase() === value.toLowerCase(); })) {
      setPhraseError("That auto text already exists.");
      return;
    }

    setPhraseError("");
    phrases.unshift(value);

    var key = value.toLowerCase();
    if (removedSet[key]) {
      removedSeeds = removedSeeds.filter(function (s) { return s.toLowerCase() !== key; });
      delete removedSet[key];
      persist(LS.removedSeeds, removedSeeds);
    }

    persist(LS.phrases, phrases);
    rebuildIndex();
    phraseInput.value = "";
    phraseFilter = "";
    phraseFilterInput.value = "";
    phraseShowAll = false;
    renderPhrases();
    renderSuggestions();
    phraseInput.focus();
  }

  /* ------------------------------------------------------------------ *
   * Recent entries
   * ------------------------------------------------------------------ */

  var historyShowAll = false;

  function pushHistory(text) {
    if (!text || !text.trim()) return false;

    var existing = -1;
    for (var i = 0; i < history.length; i += 1) {
      if (history[i].text === text) { existing = i; break; }
    }
    if (existing === 0) return false;
    if (existing > 0) history.splice(existing, 1);

    history.unshift({
      id: newId(),
      text: text,
      date: new Date().toISOString()
    });
    history = history.slice(0, HISTORY_LIMIT);
    persist(LS.history, history);
    renderHistory();
    return true;
  }

  function renderHistory() {
    historyList.replaceChildren();
    var visible = historyShowAll ? history : history.slice(0, RECENT_PREVIEW);

    if (!history.length) {
      historyList.appendChild(emptyItem("Nothing saved yet."));
      historyMore.hidden = true;
      return;
    }

    visible.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "history-item";

      var main = document.createElement("button");
      main.type = "button";
      main.className = "history-main";
      main.title = "Open in editor";

      var preview = document.createElement("div");
      preview.className = "history-preview";
      var firstLine = (entry.text || "").split("\n")[0] || "(empty)";
      preview.textContent = firstLine.length > 90 ? firstLine.slice(0, 90) + "\u2026" : firstLine;
      preview.title = firstLine;

      var date = document.createElement("div");
      date.className = "history-date";
      date.textContent = fmtDate(entry.date);

      main.appendChild(preview);
      main.appendChild(date);
      main.addEventListener("click", function () { openEntry(entry); });

      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "chip-btn small";
      copy.textContent = "Copy";
      copy.addEventListener("click", function (e) {
        e.stopPropagation();
        copyText(entry.text || "", copy);
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.textContent = "\u00d7";
      del.title = "Delete";
      del.setAttribute("aria-label", "Delete saved entry");
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!window.confirm("Delete this saved entry?")) return;
        history = history.filter(function (h) { return h.id !== entry.id; });
        persist(LS.history, history);
        renderHistory();
      });

      li.appendChild(main);
      li.appendChild(copy);
      li.appendChild(del);
      historyList.appendChild(li);
    });

    if (history.length > RECENT_PREVIEW) {
      historyMore.hidden = false;
      setLabel(historyMore, historyShowAll ? "Show fewer" : "Show all " + history.length);
    } else {
      historyMore.hidden = true;
    }
  }

  function openEntry(entry) {
    if (editor.value.trim() && editor.value !== entry.text) {
      pushHistory(editor.value);
    }
    replaceEditorText(entry.text || "");
    editor.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveEntry() {
    var text = editor.value;
    if (!text.trim()) {
      flashButton(saveBtn, "Nothing to save");
      return;
    }
    var added = pushHistory(text);
    flushDraft();
    flashButton(saveBtn, added ? "Saved" : "Already saved");
  }

  /* ------------------------------------------------------------------ *
   * Editor text replacement (keeps the native undo stack)
   * ------------------------------------------------------------------ */

  // setRangeText() does not participate in the browser's undo stack, but
  // execCommand() does. Fall back to setRangeText if execCommand is unavailable.
  function replaceRange(text, start, end) {
    editor.focus();
    editor.setSelectionRange(start, end);

    var applied = false;
    try {
      applied = text === ""
        ? document.execCommand("delete")
        : document.execCommand("insertText", false, text);
    } catch (e) { applied = false; }

    if (!applied) {
      editor.setRangeText(text, start, end, "end");
    }
  }

  function replaceEditorText(text) {
    replaceRange(text, 0, editor.value.length);
    afterEdit();
    flushDraft();
  }

  function clearEditor() {
    if (!editor.value) { editor.focus(); return; }
    var ok = window.confirm(
      "Clear the editor?\n\nYou can undo with Ctrl/Cmd+Z. Saved entries stay in Recent."
    );
    if (!ok) return;
    replaceEditorText("");
    editor.focus();
  }

  /* ------------------------------------------------------------------ *
   * Clipboard and files
   * ------------------------------------------------------------------ */

  function copyText(text, btn) {
    function fallback() {
      var helper = document.createElement("textarea");
      helper.className = "copy-helper";
      helper.value = text;
      helper.setAttribute("readonly", "");
      document.body.appendChild(helper);
      helper.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      helper.remove();
      done();
    }
    function done() {
      flashButton(btn, "Copied");
      btn.classList.add("copied-flash");
      setTimeout(function () { btn.classList.remove("copied-flash"); }, 1200);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadDraft() {
    if (!editor.value.trim()) { flashButton(downloadBtn, "Nothing to download"); return; }
    download("draft-" + fileStamp() + ".txt", editor.value, "text/plain;charset=utf-8");
    flashButton(downloadBtn, "Downloaded");
  }

  function makeBackup() {
    var payload = {
      app: "writing-app",
      schema: 1,
      exportedAt: new Date().toISOString(),
      draft: editor.value,
      phrases: phrases.slice(),
      history: history.slice()
    };
    download(
      "writing-app-backup-" + fileStamp() + ".json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    flashButton(backupBtn, "Downloaded");
  }

  function restoreBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); }
      catch (e) { window.alert("That file isn\u2019t valid JSON."); return; }

      if (!data || typeof data !== "object" ||
          (typeof data.draft !== "string" && !Array.isArray(data.phrases) && !Array.isArray(data.history))) {
        window.alert("That doesn\u2019t look like a Writing App backup.");
        return;
      }

      var ok = window.confirm(
        "Restore this backup?\n\nIt replaces your current draft, auto text and recent entries."
      );
      if (!ok) return;

      if (typeof data.draft === "string") replaceEditorText(data.draft);

      if (Array.isArray(data.phrases)) {
        phrases = uniqueByLower(data.phrases.filter(function (p) {
          return typeof p === "string" && p.trim() && p.length <= MAX_PHRASE_LENGTH;
        }));

        var present = byLower(phrases);
        removedSeeds = seeds
          .map(function (s) { return s.text; })
          .filter(function (text) { return !present[text.toLowerCase()]; });
        removedSet = byLower(removedSeeds);

        persist(LS.phrases, phrases);
        persist(LS.removedSeeds, removedSeeds);
        persist(LS.seedVersion, seedVersion);

        rebuildIndex();
        renderPhrases();
        renderSuggestions();
      }

      if (Array.isArray(data.history)) {
        history = sanitizeHistory(data.history);
        persist(LS.history, history);
        renderHistory();
      }

      flushDraft();
      setStatus("Backup restored.", "ok");
    };
    reader.onerror = function () { window.alert("Couldn\u2019t read that file."); };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  function afterEdit() {
    updateCount();
    scheduleDraftSave();
    if (!composing) renderSuggestions();
  }

  editor.addEventListener("input", afterEdit);
  editor.addEventListener("keyup", function (e) {
    if (composing) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" ||
        e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
      renderSuggestions();
    }
  });
  editor.addEventListener("click", renderSuggestions);

  editor.addEventListener("compositionstart", function () {
    composing = true;
    hideSuggestions();
  });
  editor.addEventListener("compositionend", function () {
    composing = false;
    renderSuggestions();
  });

  editor.addEventListener("keydown", function (e) {
    if (e.isComposing || composing) return;

    var digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code || "");
    if (digit && e.altKey && !e.metaKey && !e.ctrlKey) {
      var index = Number(digit[1]) - 1;
      if (currentMatches[index]) {
        e.preventDefault();
        insertPhrase(currentMatches[index]);
      }
      return;
    }

    if (e.key === "Escape" && currentMatches.length) {
      hideSuggestions();
    }
  });

  document.addEventListener("click", function (e) {
    if (suggestBar.hidden) return;
    if (suggestBar.contains(e.target) || e.target === editor) return;
    hideSuggestions();
  });

  suggestBar.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      hideSuggestions();
      editor.focus();
    }
  });

  window.addEventListener("pagehide", flushDraft);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushDraft();
  });

  clearBtn.addEventListener("click", clearEditor);
  copyBtn.addEventListener("click", function () { copyText(editor.value, copyBtn); });
  saveBtn.addEventListener("click", saveEntry);

  phraseInput.addEventListener("input", function () { setPhraseError(""); });
  phraseInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addPhrase(); }
  });
  document.getElementById("phrase-add").addEventListener("click", addPhrase);

  phraseFilterInput.addEventListener("input", function () {
    phraseFilter = phraseFilterInput.value;
    phraseShowAll = false;
    renderPhrases();
  });

  phraseMore.addEventListener("click", function () {
    phraseShowAll = !phraseShowAll;
    renderPhrases();
  });

  historyMore.addEventListener("click", function () {
    historyShowAll = !historyShowAll;
    renderHistory();
  });

  downloadBtn.addEventListener("click", downloadDraft);
  backupBtn.addEventListener("click", makeBackup);
  alertExport.addEventListener("click", makeBackup);

  restoreBtn.addEventListener("click", function () { restoreFile.click(); });
  restoreFile.addEventListener("change", function () {
    var file = restoreFile.files && restoreFile.files[0];
    restoreFile.value = "";
    if (file) restoreBackup(file);
  });

  /* ------------------------------------------------------------------ *
   * Theme
   * ------------------------------------------------------------------ */

  var THEME_KEY = "writingApp.theme.v1";

  function applyTheme(theme) {
    var next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    themeToggle.setAttribute(
      "aria-label",
      next === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
    var meta = document.getElementById("meta-theme");
    if (meta) meta.setAttribute("content", next === "dark" ? "#2e3940" : "#eef1f2");
  }

  applyTheme(read(THEME_KEY, "dark"));

  themeToggle.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    persist(THEME_KEY, next);
  });

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  var draft = read(LS.draft, "");
  editor.value = typeof draft === "string" ? draft : "";

  updateCount();
  renderPhrases();
  renderHistory();

  if (!storageAvailable) {
    setStatus("Not saved.", "error");
    showAlert("This browser is blocking local storage (private mode?). Export your work before closing this tab.");
  } else if (initNotice) {
    setStatus(initNotice, "ok");
  } else {
    setStatus("Saved in this browser only.");
  }
})();
