/* FBSearchUI v2.4 unified facet handling - scoped apply fix */
(function () {
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;

  function log(){ if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments))); }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var preferToggleUrl = !!CFG.preferToggleUrl;
  var modalRootSelector = CFG.modalRootSelector || "#filters-modal";
  var modalApplySelector = CFG.modalApplySelector || "#filters-apply";
  var clearHiddenNamePrefix = typeof CFG.clearHiddenNamePrefix === "string" ? CFG.clearHiddenNamePrefix : "f.";
  var submitDebounceMs = typeof CFG.submitDebounceMs === "number" ? CFG.submitDebounceMs : 150;

  var stripParams = (function () {
    var out;
    if (Array.isArray(CFG.stripParams)) out = CFG.stripParams.slice();
    else if (typeof CFG.stripParams === "string") out = CFG.stripParams.split(",").map(function (s) { return s.trim(); });
    else out = ["profile", "collection"];
    if (out.indexOf("query") === -1) out.push("query");
    return out;
  })();

  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";
  var clearAllSelector = CFG.clearAllSelector || "#selected-filters .f-underline, #selected-filters .clear-all, #selected-filters a[href='?']";

  var lastSubmitAt = 0;
  function now(){ return Date.now ? Date.now() : new Date().getTime(); }
  function normalisePlusToSpace(s){ return s == null ? "" : String(s).replace(/\+/g, " "); }

  function setHidden(form, name, value){
    var nodes = form.querySelectorAll('input[type="hidden"]');
    var input = null;
    for (var i = 0; i < nodes.length; i++) { if (nodes[i].name === name) { input = nodes[i]; break; } }
    if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
    input.value = value == null ? "" : String(value);
  }
  function appendHidden(form, name, value){
    var input = document.createElement("input");
    input.type = "hidden"; input.name = name; input.value = value == null ? "" : String(value);
    form.appendChild(input);
  }
  function hasNonHiddenControl(form, name){
    var nodes = form.querySelectorAll('[name]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.name === name) {
        var isHidden = (n.tagName === "INPUT") && ((n.type || "").toLowerCase() === "hidden");
        if (!isHidden) return true;
      }
    }
    return false;
  }
  function removeParams(form, keys){
    if (!keys || !keys.length) return;
    var nodes = form.querySelectorAll('input[type="hidden"][name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      for (var k = 0; k < keys.length; k++) { if (n.name === keys[k]) { n.remove(); break; } }
    }
  }
  function removeParamPair(form, name, value){
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name === name && (value == null || n.value === value)) n.remove();
    }
  }
  function clearHiddenByPrefix(form, prefix){
    if (!prefix) return;
    var nodes = form.querySelectorAll('input[type="hidden"]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name && n.name.indexOf(prefix) === 0) n.remove();
    }
  }
  function seedFromUrlSmart(form, qsOrUrl, extraExclusions){
    var exclude = Object.create(null);
    for (var i = 0; i < stripParams.length; i++) exclude[String(stripParams[i])] = true;
    if (extraExclusions && extraExclusions.length) {
      for (var j = 0; j < extraExclusions.length; j++) exclude[String(extraExclusions[j])] = true;
    }

    var search = qsOrUrl || "";
    try { if (/^https?:/i.test(qsOrUrl)) search = new URL(qsOrUrl, window.location.href).search; } catch (e) {}
    if (!search) search = window.location.search || "";
    if (search.charAt(0) === "?") search = search.slice(1);
    if (!search) return;

    var pairs = search.split("&");
    for (var p = 0; p < pairs.length; p++) {
      var raw = pairs[p]; if (!raw) continue;
      var eq = raw.indexOf("="); var k = eq >= 0 ? raw.slice(0, eq) : raw; var v = eq >= 0 ? raw.slice(eq + 1) : "";
      k = k ? decodeURIComponent(k.replace(/\+/g, " ")) : "";
      v = v ? decodeURIComponent(v.replace(/\+/g, " ")) : "";
      if (!k || exclude[k]) continue;
      if (hasNonHiddenControl(form, k)) continue;
      if (k.indexOf(clearHiddenNamePrefix) === 0) appendHidden(form, k, v);
      else setHidden(form, k, v);
    }
  }
  function safeSubmit(form){
    var t = now(); if (submitDebounceMs && (t - lastSubmitAt) < submitDebounceMs) { log("debounced submit"); return; }
    lastSubmitAt = t;
    removeParams(form, stripParams);
    if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.submit();
  }

  // NEW: build facet state from a specific root (or roots), not the whole document
  function buildFacetStateFromRoots(form, roots, extraPair){
    // start fresh from current URL, then drop all f.*
    seedFromUrlSmart(form, window.location.search);
    clearHiddenByPrefix(form, clearHiddenNamePrefix);

    var seen = Object.create(null);

    function harvest(root){
      var checks = root.querySelectorAll('input[type="checkbox"]:checked');
      for (var i = 0; i < checks.length; i++) {
        var cb = checks[i];
        if (!cb || !cb.name) continue;
        if (cb.name.indexOf(clearHiddenNamePrefix) !== 0) continue; // only f.*
        var val = normalisePlusToSpace(cb.value || "");
        var key = cb.name + "|" + val;
        if (seen[key]) continue;
        seen[key] = true;
        appendHidden(form, cb.name, val);
      }
    }

    for (var r = 0; r < roots.length; r++) if (roots[r]) harvest(roots[r]);

    // optional single-value param
    if (extraPair && extraPair.name) {
      if (extraPair.name.indexOf(clearHiddenNamePrefix) === 0) appendHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
      else setHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
    }
  }

  function attach(form){
    log("init OK - scoped facet handling");

    // Simple row click (single-value featured)
    document.addEventListener("click", function (e) {
      var option = e.target && e.target.closest('.select-wrapper .select-label-text[data-param-name][data-param-value]');
      if (!option) return;
      e.stopPropagation(); e.preventDefault();

      var toggleUrl = option.getAttribute("data-toggleurl");
      var name = option.getAttribute("data-param-name");
      var rawValue = option.getAttribute("data-param-value");
      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      // Build from the containing featured wrapper only
      var featuredRoot = option.closest('.js-fbsearch-featured-facet') || document;
      buildFacetStateFromRoots(form, [featuredRoot], { name: name, value: rawValue });
      safeSubmit(form);
    }, true);

    // Featured multiselect - Apply
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest('.multiselect button#filters-apply, .multiselect [data-featured-apply]');
      if (!btn) return;
      e.stopPropagation(); e.preventDefault();

      var featuredRoot = btn.closest('.js-fbsearch-featured-facet') || document;
      buildFacetStateFromRoots(form, [featuredRoot], null);
      safeSubmit(form);
    }, true);

    // Modal - Apply
    document.addEventListener("click", function (e) {
      var applyBtn = e.target && e.target.closest(modalApplySelector);
      if (!applyBtn || applyBtn.closest('.multiselect')) return; // ignore featured's Apply
      e.stopPropagation(); e.preventDefault();

      var modalRoot = document.querySelector(modalRootSelector) || document;
      buildFacetStateFromRoots(form, [modalRoot], null);
      safeSubmit(form);
    }, true);

    // Selected chip removal
    document.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest(selectedFilterSelector);
      if (!chip) return;
      e.stopPropagation(); e.preventDefault();

      var remName = chip.getAttribute("data-remove-name") || chip.getAttribute("data-param-name");
      var remVal  = chip.getAttribute("data-remove-value") || chip.getAttribute("data-param-value");
      var toggleUrl = chip.getAttribute("data-toggleurl");
      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      // Rebuild from both featured + modal, then drop the exact pair
      var featuredRoots = Array.prototype.slice.call(document.querySelectorAll('.js-fbsearch-featured-facet'));
      var modalRoot = document.querySelector(modalRootSelector);
      var roots = featuredRoots.concat(modalRoot ? [modalRoot] : []);
      if (!roots.length) roots = [document];

      buildFacetStateFromRoots(form, roots, null);
      if (remName) removeParamPair(form, remName, normalisePlusToSpace(remVal || ""));
      safeSubmit(form);
    }, true);

    // Clear all
    document.addEventListener("click", function (e) {
      var clear = e.target && e.target.closest(clearAllSelector);
      if (!clear) return;
      e.stopPropagation(); e.preventDefault();

      seedFromUrlSmart(form, window.location.search);
      clearHiddenByPrefix(form, clearHiddenNamePrefix);
      setHidden(form, "start_rank", "");

      // Untick everything in UI
      var modal = document.querySelector(modalRootSelector);
      if (modal) Array.prototype.forEach.call(modal.querySelectorAll('input[type="checkbox"]'), function (n){ n.checked = false; });
      Array.prototype.forEach.call(document.querySelectorAll('.multiselect input[type="checkbox"]'), function (n){ n.checked = false; });

      safeSubmit(form);
    }, true);
  }

  function boot(){
    var form = document.querySelector(formSelector);
    if (form) { attach(form); return; }
    var tries = 0, maxTries = 20;
    var t = setInterval(function () {
      form = document.querySelector(formSelector);
      if (form) { clearInterval(t); attach(form); }
      else if (++tries >= maxTries) { clearInterval(t); if (DEBUG && window.console) console.warn("[FBSearchUI] Form not found:", formSelector); }
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
