(function () {
  // Config
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;
  function log(){ if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments))); }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var modalRootSelector = CFG.modalRootSelector || "#filters-modal";
  var modalApplySelector = CFG.modalApplySelector || "#filters-apply";
  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";
  var stripParams = Array.isArray(CFG.stripParams) ? CFG.stripParams : ["profile","collection"];
  var submitDebounceMs = typeof CFG.submitDebounceMs === "number" ? CFG.submitDebounceMs : 150;

  // Helpers
  var lastSubmitAt = 0;
  function now(){ return Date.now ? Date.now() : new Date().getTime(); }

  function normalisePlusToSpace(s){
    return s == null ? "" : String(s).replace(/\+/g, " ");
  }

  function cssEsc(s){
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
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
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (keys.indexOf(nodes[i].name) !== -1) nodes[i].remove();
    }
  }

  // Parse a querystring or URL and apply params to the form, excluding keys
  // Convert '+' to space before decodeURIComponent so values like "arts+and+social+sciences" decode correctly.
  function applyQueryToForm(form, qsOrUrl, extraExclusions){
    var exclude = Object.create(null);
    (stripParams || []).forEach(function(k){ exclude[String(k)] = true; });
    (extraExclusions || []).forEach && extraExclusions.forEach(function(k){ exclude[String(k)] = true; });

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
      appendHidden(form, k, v);
    }
  }

  function safeSubmit(form){
    var t = now();
    if (submitDebounceMs && (t - lastSubmitAt) < submitDebounceMs) { log("debounced submit"); return; }
    lastSubmitAt = t;
    removeParams(form, stripParams); // final cleanup
    if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.submit();
  }

  function closeMultiselectFrom(node){
    var multiselect = node && node.closest(".multiselect");
    if (!multiselect) return;

    var body = multiselect.querySelector(".study-level-wrapper");
    if (body) {
      body.style.height = "0px";
      body.style.overflow = "hidden";
      body.classList.remove("border");
    }

    var header = multiselect.querySelector(".select-label-text");
    if (header) {
      header.classList.remove("active");
    }
  }

  function boot(){
    var form = document.querySelector(formSelector);
    if (!form) {
      if (DEBUG) console.warn("[FBSearchUI] Form not found:", formSelector);
      return;
    }

    // Single-select: sort/view/featured items that carry data-param-*
    document.addEventListener("click", function (e) {
      var option = e.target && e.target.closest('.select-wrapper .select-label-text[data-param-name][data-param-value]');
      if (!option) return;
      e.stopPropagation();
      e.preventDefault();

      var name = option.getAttribute("data-param-name");
      var rawValue = option.getAttribute("data-param-value");
      var value = normalisePlusToSpace(rawValue);

      // Start with current URL params but exclude the param we will set
      applyQueryToForm(form, window.location.search, name ? [name] : []);
      // Replace any existing entries for this name
      removeInputsByName(form, name);
      appendHidden(form, name, value);

      safeSubmit(form);
    }, true);

    // Shared Apply button handler - branches by context
    document.addEventListener("click", function (e) {
      var applyBtn = e.target && e.target.closest(modalApplySelector);
      if (!applyBtn) return;
      e.stopPropagation();
      e.preventDefault();

      var inMultiselect = !!applyBtn.closest(".multiselect");
      var inModal = !!applyBtn.closest(modalRootSelector);

      // Always start by mirroring current URL params so we preserve unrelated state
      applyQueryToForm(form, window.location.search);

      if (inMultiselect) {
        // Featured Filters multiselect:
        // - collect only checkboxes inside this multiselect
        // - remove existing hidden inputs for just those names, then re-add checked ones
        var wrapper = applyBtn.closest(".multiselect");
        var checks = wrapper.querySelectorAll('input[type="checkbox"]');

        // Build a set of names present in this wrapper
        var namesInWrapper = {};
        for (var i = 0; i < checks.length; i++) {
          var n = checks[i].name;
          if (n) namesInWrapper[n] = true;
        }

        // Remove any hidden inputs for these names (to avoid duplicates)
        Object.keys(namesInWrapper).forEach(function(nm){
          removeInputsByName(form, nm);
        });

        // Re-add only the checked ones
        for (var j = 0; j < checks.length; j++) {
          var c = checks[j];
          if (c.checked && c.name) {
            appendHidden(form, c.name, normalisePlusToSpace(c.value || ""));
          }
        }

        // Close the multiselect body
        closeMultiselectFrom(applyBtn);
        safeSubmit(form);
        return;
      }

      if (inModal) {
        // All Filters modal
        var modal = document.querySelector(modalRootSelector);
        if (modal) {
          // Gather all modal checkboxes
          var checks = modal.querySelectorAll('input[type="checkbox"]');

          // Build a set of names found in the modal
          var namesInModal = {};
          for (var k = 0; k < checks.length; k++) {
            var nm = checks[k].name;
            if (nm) namesInModal[nm] = true;
          }

          // Remove any existing hidden inputs for those names
          Object.keys(namesInModal).forEach(function(nm){
            removeInputsByName(form, nm);
          });

          // Add back only the checked ones
          for (var m = 0; m < checks.length; m++) {
            var ck = checks[m];
            if (ck.checked && ck.name) {
              appendHidden(form, ck.name, normalisePlusToSpace(ck.value || ""));
            }
          }
        }

        safeSubmit(form);
        return;
      }

      // Fallback: if #filters-apply is clicked outside known contexts, just submit preserved params
      safeSubmit(form);
    }, true);

    // Featured Filters multiselect - Cancel
    document.addEventListener("click", function (e) {
      var cancel = e.target && e.target.closest(".multiselect .cancel-button");
      if (!cancel) return;
      e.stopPropagation();
      e.preventDefault();
      closeMultiselectFrom(cancel);
    }, true);

    // Selected filter chip removal (if you have chips)
    document.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest(selectedFilterSelector);
      if (!chip) return;
      e.stopPropagation();
      e.preventDefault();

      // Rebuild form from current URL first
      applyQueryToForm(form, window.location.search);

      var remName = chip.getAttribute("data-remove-name") || chip.getAttribute("data-param-name");
      var remVal  = chip.getAttribute("data-remove-value") || chip.getAttribute("data-param-value");

      if (remName) {
        if (remVal != null && remVal !== "") {
          // Remove specific name=value pairs
          var nodes = form.querySelectorAll('input[name="' + cssEsc(remName) + '"]');
          for (var i = nodes.length - 1; i >= 0; i--) {
            if (nodes[i].value === normalisePlusToSpace(remVal)) nodes[i].remove();
          }
        } else {
          // Remove all with this name
          removeInputsByName(form, remName);
        }
      } else {
        // Fallback: try to match plain text to f.* values
        var text = (chip.textContent || "").trim().toLowerCase();
        if (text) {
          var all = form.querySelectorAll('input[name]');
          for (var j = all.length - 1; j >= 0; j--) {
            var n = all[j];
            if (n.name && n.name.indexOf("f.") === 0 && n.value.trim().toLowerCase() === text) {
              n.remove();
            }
          }
        }
      }

      safeSubmit(form);
    }, true);

    log("init OK");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
