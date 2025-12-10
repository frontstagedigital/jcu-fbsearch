/* FBSearchUI v2.3 */
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

  // strip query from params to avoid duplication
  var stripParams = (function(){
    var out;
    if (Array.isArray(CFG.stripParams)) {
      out = CFG.stripParams.slice();
    } else if (typeof CFG.stripParams === "string") {
      out = CFG.stripParams.split(",").map(function(s){ return s.trim(); });
    } else {
      out = ["profile","collection"];
    }
    if (out.indexOf("query") === -1) out.push("query");
    return out;
  })();

  // Selected filter chips selector
  var selectedFilterSelector = CFG.selectedFilterSelector || "#selected-filters .btn.active, #selected-filters [data-remove-name][data-remove-value]";

  // "Clear all" selector 
  var clearAllSelector = CFG.clearAllSelector || "#selected-filters .f-underline, #selected-filters .clear-all, #selected-filters a[href='?']";

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

  // check if the form already contains a non-hidden control with this name
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

  // remove hidden inputs for the given keys 
  function removeParams(form, keys){
    if (!keys || !keys.length) return;
    var nodes = form.querySelectorAll('input[type="hidden"][name]');
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
      var nm = nodeList[i].name || "";
      if (!nm || seen[nm]) continue;
      seen[nm] = true;
      out.push(nm);
    }
    return out;
  }

  // Parse querystring and apply params to the form
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
      if (!k || exclude[k]) continue;

      // Skip creating a hidden field if already exist
      if (hasNonHiddenControl(form, k)) continue;

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
    // cleanup of mirrored hidden fields 
    removeParams(form, stripParams);
    if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.submit();
  }

  function attach(form){
    log("init OK - featured multiselect + chip removal + apply");

    // Featured/Simple clicks - submit with preserved params
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

      // reset pagination when sort/view changes
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

      var body = ms.querySelector('.study-level-wrapper');
      if (body) {
        body.style.height = "0px";
        body.style.overflow = "hidden";
        body.classList.remove("border");
      }

      var head = ms.querySelector('.select-label-text');
      if (head) head.classList.remove('active');
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

    // Selected filter removal (single chip)
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

    // Selected filters - Clear all
    document.addEventListener("click", function (e) {
      var clear = e.target && e.target.closest(clearAllSelector);
      if (!clear) return;

      e.stopPropagation(); e.preventDefault();

      // Pre-fill with current URL
      applyQueryToForm(form, window.location.search);

      // Remove all facet params (prefix "f.")
      clearHiddenByPrefix(form, clearHiddenNamePrefix);

      // Defensive: remove any non-hidden fields that might start with the facet prefix
      var facetPrefixEsc = clearHiddenNamePrefix.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
      var stray = form.querySelectorAll('[name^="' + facetPrefixEsc + '"]');
      for (var i = stray.length - 1; i >= 0; i--) stray[i].remove();

      // Reset pagination back to first page
      setHidden(form, "start_rank", "");

      // Visually untick everything in UI
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


document.addEventListener("DOMContentLoaded", function () {
  // Text data
  const copy = {
    studentTypeDomestic: "A current or recent resident of Australia, or a New Zealand citizen, studying at a campus in Australia",
    studentTypeInternational: "A student who is not an Australian or New Zealand citizen, or a permanent resident of Australia, studying at a campus in Australia or overseas",
    studyLevelPostgraduate: "Study after your first degree (Usually your second degree)",
    studyLevelUndergraduate: "Usually your first degree",
    studyLevelResearch: "Advanced study including a research project"
  };

  function appendDescription(selector, text, extraClass) {
    const targets = document.querySelectorAll(selector);
    if (!targets.length) return;

    targets.forEach(function (el) {
      const p = document.createElement("p");
      p.className = "f-small m-0" + (extraClass ? " " + extraClass : "");
      p.textContent = text;
      el.appendChild(p);
    });
  }

  // Featured facet - student type
  appendDescription(
    ".js-fbsearch-featured-facet .study-level-wrapper div[data-student-type='domestic'] label",
    copy.studentTypeDomestic,
    "p-l-150"
  );

  appendDescription(
    ".js-fbsearch-featured-facet .study-level-wrapper div[data-student-type='international'] label",
    copy.studentTypeInternational,
    "p-l-150"
  );

  // Featured facet - study level
  appendDescription(
    ".js-fbsearch-featured-facet .study-level-wrapper div[data-study-level='postgraduate'] label",
    copy.studyLevelPostgraduate,
    "p-l-150"
  );

  appendDescription(
    ".js-fbsearch-featured-facet .study-level-wrapper div[data-study-level='undergraduate'] label",
    copy.studyLevelUndergraduate,
    "p-l-150"
  );

  appendDescription(
    ".js-fbsearch-featured-facet .study-level-wrapper div[data-study-level='research'] label",
    copy.studyLevelResearch,
    "p-l-150"
  );

  // Filters panel - student type
  appendDescription(
    "#filters-panel #student-type-content .js-fbsearch-filters-modal--label-text[data-filter-name='domestic']",
    copy.studentTypeDomestic
  );

  appendDescription(
    "#filters-panel #student-type-content .js-fbsearch-filters-modal--label-text[data-filter-name='International']",
    copy.studentTypeInternational
  );

  // Filters panel - study level
  appendDescription(
    "#filters-panel #study-level-content .js-fbsearch-filters-modal--label-text[data-filter-name='postgraduate']",
    copy.studyLevelPostgraduate
  );

  appendDescription(
    "#filters-panel #study-level-content .js-fbsearch-filters-modal--label-text[data-filter-name='undergraduate']",
    copy.studyLevelUndergraduate
  );

  appendDescription(
    "#filters-panel #study-level-content .js-fbsearch-filters-modal--label-text[data-filter-name='research']",
    copy.studyLevelResearch
  );
});


// Config
var compareCookieName = "fbsearch_compare_courses";
var debugEnabled = true;              // enable/disable debug
var debugTargetId = "compare-debug";  // Id for the debug div

var debugElement = null;

// Cookie helpers
function setCookie(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
    }
    return null;
}

// saved IDs
function getSavedAssetIds() {
    var cookieValue = getCookie(compareCookieName);
    if (!cookieValue) return [];

    try {
        var parsed = JSON.parse(cookieValue);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveAssetIds(ids) {
    setCookie(compareCookieName, JSON.stringify(ids), 30); // 30 days
    updateDebugOutput();
}

function toggleAssetId(assetId) {
    var ids = getSavedAssetIds();
    var index = ids.indexOf(assetId);

    if (index === -1) {
        ids.push(assetId);
        saveAssetIds(ids);
        return true; // saved
    } else {
        ids.splice(index, 1);
        saveAssetIds(ids);
        return false; // removed
    }
}

// Debug 
function ensureDebugElement() {
    if (!debugEnabled) return null;

    if (debugElement && document.body.contains(debugElement)) {
        return debugElement;
    }

    var resultsContainer = document.getElementById("search-results");
    if (!resultsContainer) return null;

    var wrapperParent = resultsContainer.parentNode;
    if (!wrapperParent) return null;

    var div = document.createElement("div");
    div.id = debugTargetId;
    div.style.fontFamily = "monospace";
    div.style.fontSize = "12px";
    div.style.marginBottom = "8px";

    wrapperParent.insertBefore(div, resultsContainer);

    debugElement = div;
    return debugElement;
}

function updateDebugOutput() {
    if (!debugEnabled) return;

    var target = ensureDebugElement();
    if (!target) return;

    var ids = getSavedAssetIds();
    if (ids.length === 0) {
        target.textContent = "Saved asset IDs: (none)";
    } else {
        target.textContent = "Saved asset IDs: " + ids.join(", ");
    }
}

function setButtonSavedState(button, isSaved) {
    if (isSaved) {
        // Saved state
        button.classList.remove("checkbox-blank-black-before");
        button.classList.add("checkbox-checked-black-before", "saved");
        button.textContent = "Saved";
    } else {
        // Unsaved/default state
        button.classList.remove("checkbox-checked-black-before", "saved");
        button.classList.add("checkbox-blank-black-before");
        button.innerHTML = '<span class="d-none-med">compare</span>';
    }
}

document.addEventListener("DOMContentLoaded", function () {
    var resultsContainer = document.getElementById("search-results");
    if (!resultsContainer) return;

    // Set up debug div if enabled
    if (debugEnabled) {
        ensureDebugElement();
        updateDebugOutput();
    }

    var buttons = resultsContainer.querySelectorAll(
        ".js-fbsearch-result-item .js-fbsearch-compare-save"
    );

    var savedIds = getSavedAssetIds();

    // Initialise buttons from cookie
    for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var assetId = btn.dataset.courseAssetId;

        if (!assetId) continue;

        var isSaved = savedIds.indexOf(assetId) !== -1;
        setButtonSavedState(btn, isSaved);

        btn.addEventListener("click", function (e) {
            e.preventDefault();

            var assetId = this.dataset.courseAssetId;
            if (!assetId) return;

            var nowSaved = toggleAssetId(assetId);
            setButtonSavedState(this, nowSaved);
        });
    }
});
