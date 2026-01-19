
/* FBSearchUI v2.4 unified facet handling */
(function () {
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;

  function log() {
    if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments)));
  }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var preferToggleUrl = !!CFG.preferToggleUrl; // default false
  var modalRootSelector = CFG.modalRootSelector || "#filters-modal";
  var modalApplySelector = CFG.modalApplySelector || "#filters-apply";
  var clearHiddenNamePrefix = typeof CFG.clearHiddenNamePrefix === "string" ? CFG.clearHiddenNamePrefix : "f.";
  var submitDebounceMs = typeof CFG.submitDebounceMs === "number" ? CFG.submitDebounceMs : 150;

  // strip query from params to avoid duplication
  var stripParams = (function () {
    var out;
    if (Array.isArray(CFG.stripParams)) {
      out = CFG.stripParams.slice();
    } else if (typeof CFG.stripParams === "string") {
      out = CFG.stripParams.split(",").map(function (s) { return s.trim(); });
    } else {
      out = ["profile", "collection"];
    }
    if (out.indexOf("query") === -1) out.push("query");
    return out;
  })();

  // Selected filter chips selector
  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";

  // "Clear all" selector
  var clearAllSelector = CFG.clearAllSelector || "#selected-filters .f-underline, #selected-filters .clear-all, #selected-filters a[href='?']";

  var lastSubmitAt = 0;

  function now() { return Date.now ? Date.now() : new Date().getTime(); }
  function normalisePlusToSpace(s) { return s == null ? "" : String(s).replace(/\+/g, " "); }

  function setHidden(form, name, value) {
    var nodes = form.querySelectorAll('input[type="hidden"]');
    var input = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].name === name) { input = nodes[i]; break; }
    }
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value == null ? "" : String(value);
  }

  function appendHidden(form, name, value) {
    var input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value == null ? "" : String(value);
    form.appendChild(input);
  }

  function hasNonHiddenControl(form, name) {
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

  function removeParams(form, keys) {
    if (!keys || !keys.length) return;
    var nodes = form.querySelectorAll('input[type="hidden"][name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      for (var k = 0; k < keys.length; k++) {
        if (n.name === keys[k]) { n.remove(); break; }
      }
    }
  }

  function removeParamPair(form, name, value) {
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name === name && (value == null || n.value === value)) n.remove();
    }
  }

  function formHasPair(form, name, value) {
    var nodes = form.querySelectorAll('input[name]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.name === name && n.value === value) return true;
    }
    return false;
  }

  function seedFromUrlSmart(form, qsOrUrl, extraExclusions) {
    var exclude = Object.create(null);
    for (var i = 0; i < stripParams.length; i++) exclude[String(stripParams[i])] = true;
    if (extraExclusions && extraExclusions.length) {
      for (var j = 0; j < extraExclusions.length; j++) exclude[String(extraExclusions[j])] = true;
    }

    var search = qsOrUrl || "";
    try {
      if (/^https?:/i.test(qsOrUrl)) search = new URL(qsOrUrl, window.location.href).search;
    } catch (e) {}
    if (!search) search = window.location.search || "";
    if (search.charAt(0) === "?") search = search.slice(1);
    if (!search) return;

    var pairs = search.split("&");
    for (var p = 0; p < pairs.length; p++) {
      var raw = pairs[p];
      if (!raw) continue;
      var eq = raw.indexOf("=");
      var k = eq >= 0 ? raw.slice(0, eq) : raw;
      var v = eq >= 0 ? raw.slice(eq + 1) : "";
      k = k ? decodeURIComponent(k.replace(/\+/g, " ")) : "";
      v = v ? decodeURIComponent(v.replace(/\+/g, " ")) : "";
      if (!k || exclude[k]) continue;

      if (hasNonHiddenControl(form, k)) continue;

      // keep all f.* values, single for non-facets
      if (k.indexOf(clearHiddenNamePrefix) === 0) appendHidden(form, k, v);
      else setHidden(form, k, v);
    }
  }

  function safeSubmit(form) {
    var t = now();
    if (submitDebounceMs && (t - lastSubmitAt) < submitDebounceMs) { log("debounced submit"); return; }
    lastSubmitAt = t;
    removeParams(form, stripParams); // cleanup
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  }

  // Collect checkbox pairs from DOM
  function collectCheckboxPairs() {
    var selector = '.js-fbsearch-featured-facet input[type="checkbox"], ' + modalRootSelector + ' input[type="checkbox"]';
    var checks = document.querySelectorAll(selector);
    var pairs = [];
    for (var i = 0; i < checks.length; i++) {
      var cb = checks[i];
      if (!cb || !cb.name) continue;
      if (cb.name.indexOf(clearHiddenNamePrefix) !== 0) continue; // only f.*
      var val = normalisePlusToSpace(cb.value || "");
      pairs.push({ name: cb.name, value: val, checked: !!cb.checked });
    }
    return pairs;
  }

  // Build state: seed from URL, then remove unchecked pairs that exist in the DOM, ensure checked pairs
  function buildAndMirrorFacetState(form, extraPair) {
    // 1) start from current URL INCLUDING existing f.*
    seedFromUrlSmart(form, window.location.search);

    // 2) make a pass over all related checkboxes to reflect current UI deltas
    var domPairs = collectCheckboxPairs();

    // 2a) remove unchecked pairs that appear in the DOM
    for (var i = 0; i < domPairs.length; i++) {
      var dp = domPairs[i];
      if (!dp.checked) {
        removeParamPair(form, dp.name, dp.value);
      }
    }

    // 2b) ensure checked pairs are present
    var seen = Object.create(null);
    for (var j = 0; j < domPairs.length; j++) {
      var cp = domPairs[j];
      if (!cp.checked) continue;
      var key = cp.name + "|" + cp.value;
      if (seen[key]) continue;
      seen[key] = true;
      if (!formHasPair(form, cp.name, cp.value)) appendHidden(form, cp.name, cp.value);
    }

    // 3) include any extra single-value pair (e.g. sort/ui_view) supplied by caller
    if (extraPair && extraPair.name) {
      if (extraPair.name.indexOf(clearHiddenNamePrefix) === 0) {
        appendHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
      } else {
        setHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
      }
    }

    // Always reset pagination
    setHidden(form, "start_rank", "");
  }

  function attach(form) {
    log("init OK - unified facet handling (preserve non-touched facets)");

    // Featured/Simple options (single-value rows with data-param-*). Treat as "apply now"
    document.addEventListener("click", function (e) {
      var option = e.target && e.target.closest('.select-wrapper .select-label-text[data-param-name][data-param-value]');
      if (!option) return;
      e.stopPropagation();
      e.preventDefault();

      var toggleUrl = option.getAttribute("data-toggleurl");
      var name = option.getAttribute("data-param-name");
      var rawValue = option.getAttribute("data-param-value");

      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      buildAndMirrorFacetState(form, { name: name, value: rawValue });
      safeSubmit(form);
    }, true);

    // Featured multiselect - Apply button
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest('.multiselect button#filters-apply, .multiselect [data-featured-apply]');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();

      buildAndMirrorFacetState(form, null);
      safeSubmit(form);
    }, true);

    // All Filters - Apply (modal) - same path
    document.addEventListener("click", function (e) {
      var applyBtn = e.target && e.target.closest(modalApplySelector);
      if (!applyBtn || applyBtn.closest('.multiselect')) return; // ignore if caught by featured handler
      e.stopPropagation();
      e.preventDefault();

      buildAndMirrorFacetState(form, null);
      safeSubmit(form);
    }, true);

    // Selected filter removal (chip)
    document.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest(selectedFilterSelector);
      if (!chip) return;
      e.stopPropagation();
      e.preventDefault();

      var remName = chip.getAttribute("data-remove-name") || chip.getAttribute("data-param-name");
      var remVal = chip.getAttribute("data-remove-value") || chip.getAttribute("data-param-value");
      var toggleUrl = chip.getAttribute("data-toggleurl");

      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      buildAndMirrorFacetState(form, null); // start from URL, apply deltas
      if (remName) {
        removeParamPair(form, remName, normalisePlusToSpace(remVal || ""));
      }
      setHidden(form, "start_rank", "");
      safeSubmit(form);
    }, true);

    // Clear all
    document.addEventListener("click", function (e) {
      var clear = e.target && e.target.closest(clearAllSelector);
      if (!clear) return;
      e.stopPropagation();
      e.preventDefault();

      // seed non-facet params, then drop all f.*
      seedFromUrlSmart(form, window.location.search);
      var nodes = form.querySelectorAll('input[type="hidden"]');
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        if (n.name && n.name.indexOf(clearHiddenNamePrefix) === 0) n.remove();
      }
      setHidden(form, "start_rank", "");

      // Untick everything in UI
      var modal = document.querySelector(modalRootSelector);
      if (modal) {
        var modalChecks = modal.querySelectorAll('input[type="checkbox"]');
        for (var m = 0; m < modalChecks.length; m++) modalChecks[m].checked = false;
      }
      var featuredChecks = document.querySelectorAll('.multiselect input[type="checkbox"]');
      for (var f = 0; f < featuredChecks.length; f++) featuredChecks[f].checked = false;

      safeSubmit(form);
    }, true);
  }

  function boot() {
    var form = document.querySelector(formSelector);
    if (form) { attach(form); return; }
    var tries = 0, maxTries = 20;
    var t = setInterval(function () {
      form = document.querySelector(formSelector);
      if (form) { clearInterval(t); attach(form); }
      else if (++tries >= maxTries) {
        clearInterval(t);
        if (DEBUG && window.console) console.warn("[FBSearchUI] Form not found:", formSelector);
      }
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
