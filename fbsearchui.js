/* FBSearchUI v2.4 unified facet handling */
(function () {
  var CFG = window.FBSearchUI || {};
  var DEBUG = !!window.FBSearchUI_DEBUG || !!CFG.debug;

  function log() {
    if (DEBUG && window.console) console.log.apply(console, ["[FBSearchUI]"].concat([].slice.call(arguments)));
  }

  var formSelector = CFG.formSelector || (CFG.formId ? ("#" + String(CFG.formId).replace(/^#/, "")) : "#bannerCourseSearchForm");
  var preferToggleUrl = !!CFG.preferToggleUrl; // default false
  var mirrorToggleUrlParams = CFG.mirrorToggleUrlParams !== false; // default true
  var mirrorFiltersFromModal = CFG.mirrorFiltersFromModal !== false; // default true
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

  function clearHiddenByPrefix(form, prefix) {
    if (!prefix) return;
    var nodes = form.querySelectorAll('input[type="hidden"]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.name && n.name.indexOf(prefix) === 0) n.remove();
    }
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

  // ---- NEW: single unified builder used by featured + modal + single-option clicks ----
  function buildAndMirrorFacetState(form, extraPair) {
    // 1) start from current URL, but drop any existing f.*
    seedFromUrlSmart(form, window.location.search);
    clearHiddenByPrefix(form, clearHiddenNamePrefix);

    // 2) collect all checked checkboxes from featured + modal
    var selector = '.js-fbsearch-featured-facet input[type="checkbox"]:checked, ' + modalRootSelector + ' input[type="checkbox"]:checked';
    var checks = document.querySelectorAll(selector);

    var seen = Object.create(null);
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

    // 3) include any extra single-value pair (e.g. sort/ui_view) supplied by caller
    if (extraPair && extraPair.name) {
      if (extraPair.name.indexOf(clearHiddenNamePrefix) === 0) {
        // facet-like - allow repeats
        appendHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
      } else {
        setHidden(form, extraPair.name, normalisePlusToSpace(extraPair.value || ""));
      }
    }
  }

  function attach(form) {
    log("init OK - unified facet handling");

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

      // rebuild facet state and include this explicit pair
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

      // rebuild from UI, then remove the exact pair
      buildAndMirrorFacetState(form, null);
      if (remName) {
        removeParamPair(form, remName, normalisePlusToSpace(remVal || ""));
      }
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
      clearHiddenByPrefix(form, clearHiddenNamePrefix);
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


document.addEventListener("DOMContentLoaded", function () {
    // Text data
    const copy = {
        studentTypeDomestic: "A current or recent resident of Australia, or a New Zealand citizen, studying at a campus in Australia",
        studentTypeInternational: "A student who is not an Australian or New Zealand citizen, or a permanent resident of Australia, studying at a campus in Australia or overseas",
        studyLevelPostgraduate: "Study after your first degree (Usually your second degree)",
        studyLevelUndergraduate: "Usually your first degree",
        studyLevelResearch: "Advanced study including a research project",
        studyLevelPathways: "Preparation courses for uni entry"
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

    appendDescription(
        ".js-fbsearch-featured-facet .study-level-wrapper div[data-study-level='pathways-and-bridging-programs'] label",
        copy.studyLevelPathways,
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

    appendDescription(
        "#filters-panel #study-level-content .js-fbsearch-filters-modal--label-text[data-filter-name='pathways and bridging programs']",
        copy.studyLevelPathways
    );        

    var form = document.getElementById('bannerCourseSearchForm');
    var switcher = document.querySelector('.js-search-collection-switcher');
    if (!form || !switcher) return;

    var buttons = switcher.querySelectorAll('.js-search-collection-switcher-button');

    function getActiveButton() {
        return (switcher.querySelector('.js-search-collection-switcher-button[active]'));
    }

    function updateFormAction() {
        var btn = getActiveButton();
        if (!btn) return;

        var collection = btn.getAttribute('collection'); // "courses" or "global"
        var url = null;

        if (collection === 'courses') url = form.dataset.coursesSearch;
        else if (collection === 'global') url = form.dataset.globalSearch;

        if (url) form.setAttribute('action', url);
    }

    
    var banner = document.getElementById('banner-header--wrapper');

    function normaliseUrl(u) {
        try {
            var s = String(u || '');
            var q = s.indexOf('?');
            if (q > -1) s = s.slice(0, q);
            if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
            return s;
        } catch (e) { return String(u || ''); }
    }

    function getCollectionFromAction() {
        var act = normaliseUrl(form.getAttribute('action') || '');
        var courses = normaliseUrl(form.dataset.coursesSearch || '');
        var global  = normaliseUrl(form.dataset.globalSearch || '');
        if (act && courses && act == courses) return 'courses';
        if (act && global  && act == global)  return 'global';
        var b = switcher && switcher.querySelector('.js-search-collection-switcher-button[active]');
        return b ? (b.getAttribute('collection') || 'courses') : 'courses';
    }

    function updateBannerCopyByCollection(collection) {
        if (!banner) return;
        var h1 = banner.querySelector('h1');
        var p  = banner.querySelector('p');
        if (!h1 || !p) return;
        if (collection === 'courses') {
            h1.textContent = 'Discover courses';
            p.textContent  = 'Search undergraduate, postgraduate, research, and short courses across JCU';
            banner.setAttribute('data-search-type', 'courses');
        } else {
            h1.textContent = 'Discover JCU';
            p.textContent  = 'Search all JCU content - news, services, guides, events and more';
            banner.setAttribute('data-search-type', 'global');
        }
    }

    function syncBannerToFormAction() {
        updateBannerCopyByCollection(getCollectionFromAction());
    }

    if (window.MutationObserver) {
        var mo = new MutationObserver(function(muts) {
            for (var i = 0; i < muts.length; i++) {
                if (muts[i].type === 'attributes' && muts[i].attributeName === 'action') {
                    syncBannerToFormAction();
                    break;
                }
            }
        });
        mo.observe(form, { attributes: true, attributeFilter: ['action'] });
    }

    (function wrapUpdateFormAction(){
        var _orig = updateFormAction;
        updateFormAction = function(){
            if (_orig) _orig();
            syncBannerToFormAction();
        };
    })();

    syncBannerToFormAction();
    // Banner copy updater
    var banner = document.getElementById('banner-header--wrapper');

    function getActiveButton() {
        return switcher.querySelector('.js-search-collection-switcher-button[active]');
    }

    function getActiveCollection() {
        var btn = getActiveButton();
        return btn ? (btn.getAttribute('collection') || 'courses') : 'courses';
    }

    function updateBannerCopy(collection) {
        if (!banner) return;
        var h1 = banner.querySelector('h1');
        var p  = banner.querySelector('p');
        if (!h1 || !p) return;

        if (collection === 'courses') {
            h1.textContent = 'Discover courses';
            p.textContent  = 'Search undergraduate, postgraduate, research, and short courses across JCU';
            banner.setAttribute('data-search-type', 'courses');
        } else {
            h1.textContent = 'Discover JCU';
            p.textContent  = 'Search all JCU content - news, services, guides, events and more';
            banner.setAttribute('data-search-type', 'global');
        }
    }

    function syncUiToCollection() {
        updateFormAction();
        updateBannerCopy(getActiveCollection());
    }

    // click handler: after setting the new active state, call sync
    switcher.addEventListener('click', function (e) {
        var btn = e.target.closest('.js-search-collection-switcher-button');
        if (!btn || !switcher.contains(btn)) return;

        // no-op if already active
        if (btn.hasAttribute('active')) return;

        // clear existing active state
        buttons.forEach(function (b) { b.removeAttribute('active'); });
        // set active on clicked
        btn.setAttribute('active', '');

        // update form + banner together
        syncUiToCollection();
    });

    // initial sync to match whatever is marked active in the DOM
    syncUiToCollection();

    switcher.addEventListener('click', function (e) {
        var btn = e.target.closest('.js-search-collection-switcher-button');
        if (!btn || !switcher.contains(btn)) return;

        // clear existing active state
        buttons.forEach(function (b) {
            b.removeAttribute('active');
        });

        // set active on clicked
        btn.setAttribute('active', '');

        updateFormAction();
    });

    updateFormAction();

});



// Config for compare/save functionality with cookie
var compareCookieName = "jcu_saved_courses";
var compareCookieDomain = ".www.jcu.edu.au";
var debugEnabled = true; // Toggle debug
var debugTargetId = "compare-debug"; // debug div output

var debugElement = null;

// Cookie helpers
function setCookie(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + value + expires + "; path=/; domain=" + compareCookieDomain;
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }
    return null;
}

// Helpers for saved IDs
function getSavedAssetIds() {
    var cookieValue = getCookie(compareCookieName);
    if (!cookieValue) return [];

    // Try plain JSON 
    try {
        var parsedPlain = JSON.parse(cookieValue);
        if (Array.isArray(parsedPlain)) {
            return parsedPlain;
        }
    } catch (e) {
        // ignore and try below
    }

    // If encoded 
    try {
        var decoded = decodeURIComponent(cookieValue);
        var parsedDecoded = JSON.parse(decoded);
        if (Array.isArray(parsedDecoded)) {
            // Normalise 
            saveAssetIds(parsedDecoded);
            return parsedDecoded;
        }
    } catch (e2) {
        // empty
    }

    return [];
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
        return true; // now saved
    } else {
        ids.splice(index, 1);
        saveAssetIds(ids);
        return false; // now removed
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

// UI helpers
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

    // debug
    if (debugEnabled) {
        ensureDebugElement();
        updateDebugOutput();
    }

    var buttons = resultsContainer.querySelectorAll(
        ".js-fbsearch-result-item .js-fbsearch-compare-save"
    );

    var savedIds = getSavedAssetIds();

    // Initialise buttons 
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
