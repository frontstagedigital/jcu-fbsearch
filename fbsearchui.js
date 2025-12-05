(function () {
  // FBSearchUI v2.1 - single-select + multiselect support
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;
  function log(){ if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments))); }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var preferToggleUrl = !!CFG.preferToggleUrl;                            // default false
  var mirrorToggleUrlParams = CFG.mirrorToggleUrlParams !== false;         // default true
  var mirrorFiltersFromModal = CFG.mirrorFiltersFromModal !== false;       // default true
  var modalRootSelector = CFG.modalRootSelector || "#filters-modal";
  var modalApplySelector = CFG.modalApplySelector || "#filters-apply";
  var clearHiddenNamePrefix = typeof CFG.clearHiddenNamePrefix === "string" ? CFG.clearHiddenNamePrefix : "f.";
  var submitDebounceMs = typeof CFG.submitDebounceMs === "number" ? CFG.submitDebounceMs : 150;
  var stripParams = Array.isArray(CFG.stripParams) ? CFG.stripParams : ["profile","collection"];
  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";

  // --- helpers ---
  var lastSubmitAt = 0;
  function now(){ return Date.now ? Date.now() : new Date().getTime(); }
  function normalisePlusToSpace(s){ return s == null ? "" : String(s).replace(/\+/g, " "); }

  function cssEsc(s){
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  }

  function setHidden(form, name, value){
    var nodes = form.querySelectorAll('input[type="hidden"]');
    var input = null;
    for (var i = 0; i < nodes.length; i++){ if (nodes[i].name === name){ input = nodes[i]; break; } }
    if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
    input.value = value == null ? "" : String(value);
  }

  function appendHidden(form, name, value){
    var h = document.createElement("input");
    h.type = "hidden";
    h.name = name;
    h.value = value == null ? "" : String(value);
    form.appendChild(h);
  }

  function removeInputsByName(form, name){
    var nodes = form.querySelectorAll('input[name="' + cssEsc(name) + '"]');
    for (var i = nodes.length - 1; i >= 0; i--) nodes[i].remove();
  }

  function removeParams(form, keys){
    if (!keys || !keys.length) return;
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) if (keys.indexOf(nodes[i].name) !== -1) nodes[i].remove();
  }

  function removeParamPair(form, name, value){
    var nodes = form.querySelectorAll('input[name]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name === name && (value == null || n.value === value)) n.remove();
    }
  }

  // Parse a querystring or URL and apply params to the form, excluding keys
  // Important: convert '+' to space before decodeURIComponent so values like "arts+and+social+sciences" decode correctly.
  function applyQueryToForm(form, qsOrUrl, extraExclusions){
    var exclude = Object.create(null);
    (stripParams || []).forEach(function(k){ exclude[String(k)] = true; });
    (extraExclusions || []).forEach(function(k){ exclude[String(k)] = true; });

    var search = qsOrUrl;
    try { if (/^https?:/i.test(qsOrUrl)) search = new URL(qsOrUrl, window.location.href).search; } catch(e) {}
    if (!search) search = window.location.search || "";
    if (search.charAt(0) === "?") search = search.slice(1);

    if (!search) return;
    var pairs = search.split("&");
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var kv = pairs[i].split("=");
      var k = kv[0] ? decodeURIComponent(kv[0].replace(/\+/g, " ")) : "";
      var v = kv.length > 1 ? decodeURIComponent(kv.slice(1).join("=").replace(/\+/g, " ")) : "";
      if (exclude[k]) continue;
      appendHidden(form, k, v); // preserve duplicates from URL if present
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

  function closeStudyLevelWrapper(node){
    var multiselect = node && node.closest(".multiselect");
    if (!multiselect) return;
    var body = multiselect.querySelector(".study-level-wrapper");
    if (!body) return;
    body.style.height = "0px";
    body.style.overflow = "hidden";
  }

  function safeSubmit(form){
    var t = now();
    if (submitDebounceMs && (t - lastSubmitAt) < submitDebounceMs) { log("debounced submit"); return; }
    lastSubmitAt = t;
    removeParams(form, stripParams); // final cleanup
    if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.submit();
  }

  function attach(form){
    log("init OK - chip removal + multiselect");

    // Single-select option clicks (featured facets, sort, view)
    document.addEventListener("click", function (e) {
      var option = e.target && e.target.closest('.select-wrapper .select-label-text[data-param-name][data-param-value]');
      if (!option) return;
      e.stopPropagation();

      var toggleUrl = option.getAttribute("data-toggleurl");
      var name = option.getAttribute("data-param-name");
      var rawValue = option.getAttribute("data-param-value");
      var value = normalisePlusToSpace(rawValue);

      if (preferToggleUrl && toggleUrl) { e.preventDefault(); window.location.href = toggleUrl; return; }

      // Rebuild form from current URL, excluding the param we are setting
      applyQueryToForm(form, window.location.search, name ? [name] : []);
      if (mirrorToggleUrlParams && toggleUrl) applyQueryToForm(form, toggleUrl, name ? [name] : []);

      if (name) { removeInputsByName(form, name); appendHidden(form, name, value); }

      updateControlLabel(option);
      e.preventDefault();
      safeSubmit(form);
    }, true);

    // "All Filters" modal - Apply
    document.addEventListener("click", function (e) {
      var applyBtn = e.target && e.target.closest(modalApplySelector);
      if (!applyBtn) return;
      e.stopPropagation(); e.preventDefault();

      applyQueryToForm(form, window.location.search);

      if (mirrorFiltersFromModal) {
        var modal = document.querySelector(modalRootSelector);
        if (modal) {
          clearHiddenByPrefix(form, clearHiddenNamePrefix);
          var checks = modal.querySelectorAll('input[type="checkbox"]:checked');
          for (var i = 0; i < checks.length; i++) {
            var c = checks[i];
            if (!c.name) continue;
            appendHidden(form, c.name, normalisePlusToSpace(c.value || ""));
          }
        }
      }

      safeSubmit(form);
    }, true);

    // Featured facet MULTISELECT - Apply
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest(".multiselect [data-featured-apply]");
      if (!btn) return;

      e.stopPropagation(); e.preventDefault();

      var param = btn.getAttribute("data-featured-apply") || "";
      var wrapper = btn.closest(".multiselect");
      if (!param || !wrapper) return;

      // Start from current URL, but exclude the multiselect param we are about to set
      applyQueryToForm(form, window.location.search, [param]);

      // Remove any existing hidden inputs for this param
      removeInputsByName(form, param);

      // Mirror all checked boxes for this facet
      var checks = wrapper.querySelectorAll('input[type="checkbox"][name="' + cssEsc(param) + '"]:checked');
      for (var i = 0; i < checks.length; i++) appendHidden(form, param, normalisePlusToSpace(checks[i].value || ""));

      // Close dropdown body before submit
      closeStudyLevelWrapper(btn);
      safeSubmit(form);
    }, true);

    // Featured facet MULTISELECT - Cancel (close only)
    document.addEventListener("click", function (e) {
      var cancel = e.target && e.target.closest(".multiselect .cancel-button");
      if (!cancel) return;
      e.stopPropagation(); e.preventDefault();
      closeStudyLevelWrapper(cancel); // height:0 and overflow:hidden
    }, true);

    // Selected filter chip removal
    document.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest(selectedFilterSelector);
      if (!chip) return;
      e.stopPropagation(); e.preventDefault();

      var remName = chip.getAttribute("data-remove-name") || chip.getAttribute("data-param-name");
      var remVal  = chip.getAttribute("data-remove-value") || chip.getAttribute("data-param-value");
      var toggleUrl = chip.getAttribute("data-toggleurl");

      if (preferToggleUrl && toggleUrl) { window.location.href = toggleUrl; return; }

      applyQueryToForm(form, window.location.search);

      if (remName) {
        if (remVal != null && remVal !== "") removeParamPair(form, remName, normalisePlusToSpace(remVal));
        else removeInputsByName(form, remName);
      } else {
        // plain-text chip fallback
        var text = (chip.textContent || "").trim();
        if (text) {
          var nodes = form.querySelectorAll('input[name]');
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (n.name && n.name.indexOf("f.") === 0 && n.value.trim().toLowerCase() === text.toLowerCase()) n.remove();
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
      else if (++tries >= maxTries) { clearInterval(t); if (DEBUG) console.warn("[FBSearchUI] Form not found:", formSelector); }
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
