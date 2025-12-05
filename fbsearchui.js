/* FBSearchUI v2.2 - Featured multiselect + robust Apply + shared closer */
(function () {
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;
  function log(){ if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments))); }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var preferToggleUrl = !!CFG.preferToggleUrl;                             // default false
  var mirrorToggleUrlParams = CFG.mirrorToggleUrlParams !== false;         // default true
  var mirrorFiltersFromModal = CFG.mirrorFiltersFromModal !== false;       // default true
  var modalRootSelector = CFG.modalRootSelector || "#filters-modal";
  var modalApplySelector = CFG.modalApplySelector || "#filters-apply";
  var clearHiddenNamePrefix = typeof CFG.clearHiddenNamePrefix === "string" ? CFG.clearHiddenNamePrefix : "f.";
  var submitDebounceMs = typeof CFG.submitDebounceMs === "number" ? CFG.submitDebounceMs : 150;

  // Important: ensure this is always an array
  var stripParams = (function(){
    if (Array.isArray(CFG.stripParams)) return CFG.stripParams;
    if (typeof CFG.stripParams === "string") {
      var parts = CFG.stripParams.split(",");
      var out = [];
      for (var i = 0; i < parts.length; i++) out.push(parts[i].trim());
      return out;
    }
    return ["profile","collection"];
  })();

  // Selected filter chips selector - update if your markup differs
  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";

  // --- helpers ---
  var lastSubmitAt = 0;
  function now(){ return Date.now ? Date.now() : new Date().getTime(); }
  function normalisePlusToSpace(s){ return s == null ? "" : String(s).replace(/\+/g, " "); }

  function setHidden(form, name, value){
    var nodes = form.querySelectorAll('input[type="hidden"]');
    var input = null;
    for (var i = 0; i < nodes.length; i++){ if (nodes[i].name === name){ input = nodes[i]; break; } }
    if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
    input.value = value == null ? "" : String(value);
  }

  function removeParams(form, keys){
    if (!keys || !keys.length) return;
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      for (var k = 0; k < keys.length; k++) {
        if (n.name === keys[k]) { n.remove(); break; }
      }
    }
  }

  function removeParamPair(form, name, value){
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name === name && (value == null || n.value === value)) n.remove();
    }
  }

  function uniqueNamesFromNodeList(nodeList){
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < nodeList.length; i++) {
      var nm = nodeList[i] && nodeList[i].name || "";
      if (!nm || seen[nm]) continue;
      seen[nm] = true;
      out.push(nm);
    }
    return out;
  }

  // Parse a querystring or URL and apply params to the form, excluding keys
  // Important: convert '+' to space before decodeURIComponent so values like "arts+and+social+sciences" decode correctly.
  function applyQueryToForm(form, qsOrUrl, extraExclusions){
    var exclude = Object.create(null);

    // stripParams (array) -> exclude map
    for (var i = 0; i < stripParams.length; i++) exclude[String(stripParams[i])] = true;

    // extraExclusions (maybe undefined) -> exclude map
    if (extraExclusions && extraExclusions.length) {
      for (var j = 0; j < extraExclusions.length; j++) exclude[String(extraExclusions[j])] = true;
    }

    var search = qsOrUrl || "";
    try { if (/^https?:/i.test(qsOrUrl)) search = new URL(qsOrUrl, window.location.href).search; } catch(e) {}
    if (!search) search = window.location.search || "";
    if (search.charAt(0) === "?") search = search.slice(1);

    if (!search) return;
    var pairs = search.split("&");
    for (var p = 0; p < pairs.length; p++) {
      if (!pairs[p]) continue;
      var kv = pairs[p].split("=");
      var k = kv[0] ? decodeURIComponent(kv[0].replace(/\+/g, " ")) : "";
      var v = kv.length > 1 ? decodeURIComponent(kv.slice(1).join("=").replace(/\+/g, " ")) : "";
      if (exclude[k]) continue;
      setHidden(form, k, v);
    }
  }

  function updateControlLabel(optionEl){
    var wrapper = optionEl.closest(".select-wrapper");
    if (!wrapper) return;
    var active = wrapper.querySelector(".active-label-text .f-display-4");
    if (!active) return;
    var labelSpan = optionEl.querySelector("span:last-child");
    var label = (labelSpan ? labelSpan.textContent : optionEl.textContent || "").trim();
    var spans = active.querySelectorAll("span");
    if (spans.length >= 2) spans[spans.length - 1].textContent = label; else active.textContent = label;
  }

  function clearHiddenByPrefix(form, prefix){
    if (!prefix) return;
    var nodes = form.querySelectorAll('input[type="hidden"]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name && n.name.indexOf(prefix) === 0) n.remove();
    }
  }

  function safeSubmit(form){
    var t = now();
    if (submitDebounceMs && (t - lastSubmitAt) < submitDebounceMs) { log("debounced submit"); return; }
    lastSubmitAt = t;
    removeParams(form, stripParams); // final cleanup
    if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.submit();
  }

  // shared closer for a single featured multiselect
  function closeFeaturedMultiselect(root){
    if (!root) return;
    var body = root.querySelector('.study-level-wrapper');
    if (body) {
      body.style.height = "0px";
      body.style.overflow = "hidden";
      body.classList.remove("border");
    }
    var head = root.querySelector('.select-label-text');
    if (head) head.classList.remove('active');
  }

  function attach(form){
    log("init OK - featured multiselect + chip removal + apply");

    // Featured/Simple option clicks - submit with preserved params
    document.addEventListener("click", function (e) {
      var option = e.target && e.target.closest('.select-wrapper .select-label-text[data-param-name][data-param-value]');
      if (!option) return;
      e.stopPropagation();

      var toggleUrl = option.getAttribute("data-toggleurl");
      var name = option.getAttribute("data-param-name");
      var rawValue = option.getAttribute("data-param-value");
      var value = normalisePlusToSpace(rawValue);

      if (preferToggleUrl && toggleUrl) { e.preventDefault(); window.location.href = toggleUrl; return; }

      // Pre-fill with current URL params
      applyQueryToForm(form, window.location.search, name ? [name] : []);
      if (mirrorToggleUrlParams && toggleUrl) applyQueryToForm(form, toggleUrl, name ? [name] : []);

      if (name) setHidden(form, name, value);

      // Optional: reset pagination when sort/view changes
      // if (name === "sort" || name === "ui_view") setHidden(form, "start_rank", "");

      updateControlLabel(option);
      e.preventDefault();
      safeSubmit(form);
    }, true);

    // Featured multiselect - Apply button scoped to the open multiselect panel
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest('.multiselect button#filters-apply, .multiselect [data-featured-apply]');
      if (!btn) return;

      e.stopPropagation();
      e.preventDefault();

      var wrapper = btn.closest('.multiselect');
      if (!wrapper) return;

      // Start from current URL
      applyQueryToForm(form, window.location.search);

      // Collect all checked boxes in THIS featured multiselect only
      var checks = wrapper.querySelectorAll('input[type="checkbox"]:checked');

      // Remove previous mirrors only for names present in this wrapper
      var namesToClear = uniqueNamesFromNodeList(wrapper.querySelectorAll('input[type="checkbox"]'));
      for (var c = 0; c < namesToClear.length; c++) removeParamPair(form, namesToClear[c], null);

      // Mirror all checked boxes
      for (var i = 0; i < checks.length; i++) {
        var cb = checks[i];
        if (!cb.name) continue;
        setHidden(form, cb.name, normalisePlusToSpace(cb.value || ""));
      }

      // Optionally close the panel immediately for visual consistency
      closeFeaturedMultiselect(wrapper);

      // Submit
      safeSubmit(form);
    }, true);

    // Featured multiselect - Cancel button closes the dropdown and resets styles
    document.addEventListener("click", function (e) {
      var cancel = e.target && e.target.closest('.multiselect .cancel-button');
      if (!cancel) return;

      e.stopPropagation();
      e.preventDefault();

      var ms = cancel.closest('.multiselect');
      if (!ms) return;

      closeFeaturedMultiselect(ms);
    }, true);

    // All Filters - Apply (modal)
    document.addEventListener("click", function (e) {
      var applyBtn = e.target && e.target.closest(modalApplySelector);
      // If the click was handled by the featured multiselect handler above, bail out
      if (!applyBtn || applyBtn.closest('.multiselect')) return;

      e.stopPropagation(); e.preventDefault();

      // Start from current URL
      applyQueryToForm(form, window.location.search);

      // Mirror modal selections
      if (mirrorFiltersFromModal) {
        var modal = document.querySelector(modalRootSelector);
        if (modal) {
          clearHiddenByPrefix(form, clearHiddenNamePrefix);
          var checks = modal.querySelectorAll('input[type="checkbox"]:checked');
          for (var i = 0; i < checks.length; i++) {
            var c = checks[i];
            if (!c.name) continue;
            var h = document.createElement("input");
            h.type = "hidden";
            h.name = c.name;
            h.value = normalisePlusToSpace(c.value || "");
            form.appendChild(h);
          }
        }
      }

      safeSubmit(form);
    }, true);

    // Selected filter removal
    document.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest(selectedFilterSelector);
      if (!chip) return;
      e.stopPropagation(); e.preventDefault();

      var remName = chip.getAttribute("data-remove-name") || chip.getAttribute("data-param-name");
      var remVal = chip.getAttribute("data-remove-value") || chip.getAttribute("data-param-value");
      var toggleUrl = chip.getAttribute("data-toggleurl");

      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      applyQueryToForm(form, window.location.search);

      if (remName) {
        if (remVal != null && remVal !== "") {
          removeParamPair(form, remName, normalisePlusToSpace(remVal));
        } else {
          removeParamPair(form, remName, null);
        }
      } else {
        var text = (chip.textContent || "").trim();
        if (text) {
          var nodes = form.querySelectorAll('input[name]');
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (n.name && n.name.indexOf("f.") === 0 && n.value.trim().toLowerCase() === text.toLowerCase()) {
              n.remove();
            }
          }
        }
      }

      safeSubmit(form);
    }, true);
  }

  function boot(){
    var form = document.querySelector(formSelector);
    if (form) { attach(form); return; }
    var tries = 0, maxTries = 20;
    var t = setInterval(function(){
      form = document.querySelector(formSelector);
      if (form) { clearInterval(t); attach(form); }
      else if (++tries >= maxTries) { clearInterval(t); if (DEBUG && window.console) console.warn("[FBSearchUI] Form not found:", formSelector); }
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
