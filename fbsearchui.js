/* FBSearchUI v2.6 sync duplicates across panels + persist sort/ui_view + countbar handlers */

(function () {
    function qsa(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    // Encode name for URL: spaces -> '+', '|' -> '%7C' (via encodeURIComponent + fix spaces)
    function encodeNameForUrl(name) {
        return encodeURIComponent(String(name)).replace(/%20/g, "+");
    }

    // Propagate a checkbox state to all duplicates with same name+value (featured, modal, etc.)
    function setAllByNameValue(name, value, checked) {
        var sel = 'input[type="checkbox"][name="' + CSS.escape(name) + '"][value="' + CSS.escape(value) + '"]';
        qsa(sel).forEach(function (el) {
            el.checked = checked;
        });
    }

    // Build a de-duplicated list of [name, value] for all checked checkboxes
    function collectSelectedPairs() {
        var out = [];
        var seen = Object.create ? Object.create(null) : {};
        qsa('input[type="checkbox"][name][value]:checked').forEach(function (el) {
            var name = el.getAttribute('name') || "";
            var value = el.getAttribute('value') || "";
            var key = name + "\u001F" + value;
            if (seen[key]) return;
            seen[key] = 1;
            out.push([name, value]);
        });
        return out;
    }

    // Turn pairs into query string, preserving base fields like query/start_rank if present in current location
    function buildQueryString(pairs, extras) {
        var params = [];

        // keep key params from current URL (extras below can override)
        var curr = new URL(window.location.href);
        var keepKeys = ['query', 'sort', 'ui_view']; // <- keep sort + view too
        var keepMap = Object.create ? Object.create(null) : {};

        keepKeys.forEach(function (k) {
            var v = curr.searchParams.get(k);
            if (v != null && v !== "") {
                keepMap[k] = v;
            }
        });

        // apply extras last to override any kept value
        if (extras && typeof extras === 'object') {
            for (var ek in extras)
                if (Object.prototype.hasOwnProperty.call(extras, ek)) {
                    keepMap[ek] = extras[ek];
                }
        }

        // push kept params first
        for (var kk in keepMap)
            if (Object.prototype.hasOwnProperty.call(keepMap, kk)) {
                params.push(encodeURIComponent(kk) + "=" + encodeURIComponent(keepMap[kk]));
            }

        // add de-duped facet params
        for (var i = 0; i < pairs.length; i++) {
            var n = pairs[i][0];
            var v = pairs[i][1];
            var nEnc = encodeNameForUrl(n).replace(/%7C/gi, "%7C"); // keep '|' encoded as %7C
            params.push(nEnc + "=" + v); // value already tokenised with '+'
        }

        return params.length ? ("?" + params.join("&")) : "";
    }


    // Build a querystring from current checked facet pairs + single-value extras (eg sort/ui_view)
    function buildQueryStringWithExtras(pairs, extras) {
        var params = [];

        // keep "query", "sort", "ui_view" if present (extras may overwrite below)
        var curr = new URL(window.location.href);
        ['query', 'sort', 'ui_view'].forEach(function (k) {
            var v = curr.searchParams.get(k);
            if (v != null && v !== "") {
                params.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
            }
        });

        // add facet params
        for (var i = 0; i < pairs.length; i++) {
            var n = pairs[i][0];
            var v = pairs[i][1];
            var nEnc = encodeNameForUrl(n).replace(/%7C/gi, "%7C");
            params.push(nEnc + "=" + v);
        }

        // apply/overwrite extras (omit if empty to remove that param)
        if (extras && typeof extras === "object") {
            Object.keys(extras).forEach(function (k) {
                var encK = encodeURIComponent(k).replace(/%20/g, "+");
                // remove any preserved instance of k
                params = params.filter(function (p) {
                    return p.split("=")[0] !== encK;
                });

                var v = extras[k];
                if (v == null || v === "") return; // empty removes the param
                params.push(encK + "=" + encodeURIComponent(v).replace(/%20/g, "+"));
            });
        }

        return params.length ? ("?" + params.join("&")) : "";
    }

    function applyFilters() {
        var pairs = collectSelectedPairs();
        var qs = buildQueryString(pairs); // extras optional
        var base = window.location.origin + window.location.pathname;
        window.location.href = base + qs;
    }

    // Uncheck all matching inputs across DOM for a chip removal, then apply
    function uncheckAllByNameValue(name, value) {
        setAllByNameValue(name, value, false);
    }

    // ------ Event wiring ------

    // 1) Live-sync any checkbox change across duplicates with the same name+value
    document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('input[type="checkbox"][name][value]')) {
            setAllByNameValue(t.name, t.value, t.checked);
        }
    });

    // 2) Featured facet "Apply" buttons (class)
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.classList && t.classList.contains('filters-apply')) {
            e.preventDefault();
            applyFilters();
        }
    });

    // 3) Modal "Apply" button (optional dedicated id - supported if present)
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.id === 'filters-apply-modal') {
            e.preventDefault();
            applyFilters();
        }
    });

    // 4) Chip removal - uncheck everywhere, then apply
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        var chip = t.closest && t.closest('#selected-filters .btn.special-search.active');
        if (chip && chip.hasAttribute('data-remove-name')) {
            e.preventDefault();
            var name = chip.getAttribute('data-remove-name') || "";
            var value = chip.getAttribute('data-remove-value') || "";
            uncheckAllByNameValue(name, value);
            applyFilters();
        }
    });

    // 5) Clear all
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('#selected-filters .f-underline.pointer')) {
            e.preventDefault();
            qsa('input[type="checkbox"][name][value]:checked').forEach(function (el) {
                el.checked = false;
            });
            applyFilters();
        }
    });

    // Sort/View option selection inside the countbar (simple with inline console.log)
    document.addEventListener('click', function (e) {
        var countbar = e.target && e.target.closest('.js-fbsearch-countbar');
        if (!countbar) return;

        var opt = e.target.closest('[data-param-name][data-param-value]');
        if (!opt || !countbar.contains(opt)) return;

        console.log('[countbar click] target:', e.target, 'option:', opt);

        e.preventDefault();

        var pname = opt.getAttribute('data-param-name') || '';
        var pval = opt.getAttribute('data-param-value') || '';

        console.log('[countbar click] param:', pname, 'value:', pval, 'node:', opt);

        // collect current facet pairs
        var pairs = collectSelectedPairs();
        console.log('[countbar click] current facet pairs:', pairs);

        // ensure only one entry for this param name
        var filtered = [];
        var seen = Object.create ? Object.create(null) : {};
        for (var i = 0; i < pairs.length; i++) {
            var n = pairs[i][0];
            var v = pairs[i][1];
            if (n === pname) continue;
            var key = n + '\u001F' + v;
            if (!seen[key]) {
                seen[key] = 1;
                filtered.push(pairs[i]);
            }
        }
        filtered.push([pname, pval]);
        console.log('[countbar click] pairs + selected option:', filtered);

        var qs = buildQueryString(filtered);
        var base = window.location.origin + window.location.pathname;
        var finalUrl = base + qs;

        console.log('[countbar click] navigate:', finalUrl);
        window.location.href = finalUrl;
    }, false);

    // Keyboard activate for accessibility (Enter/Space)
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;

        var countbar = e.target && e.target.closest('.js-fbsearch-countbar');
        if (!countbar) return;

        var opt = e.target.closest('[data-param-name][data-param-value]');
        if (!opt || !countbar.contains(opt)) return;

        e.preventDefault();

        var pname = opt.getAttribute('data-param-name') || '';
        var pval = opt.getAttribute('data-param-value') || '';

        console.log('[countbar keydown]', e.key, 'param:', pname, 'value:', pval, 'node:', opt);

        var pairs = collectSelectedPairs();
        console.log('[countbar keydown] current facet pairs:', pairs);

        var filtered = [];
        var seen = Object.create ? Object.create(null) : {};
        for (var i = 0; i < pairs.length; i++) {
            var n = pairs[i][0];
            var v = pairs[i][1];
            if (n === pname) continue;
            var key = n + '\u001F' + v;
            if (!seen[key]) {
                seen[key] = 1;
                filtered.push(pairs[i]);
            }
        }
        filtered.push([pname, pval]);
        console.log('[countbar keydown] pairs + selected option:', filtered);

        var qs = buildQueryString(filtered);
        var base = window.location.origin + window.location.pathname;
        var finalUrl = base + qs;

        console.log('[countbar keydown] navigate:', finalUrl);
        window.location.href = finalUrl;
    }, false);



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
            } catch (e) {
                return String(u || '');
            }
        }

        function getCollectionFromAction() {
            var act = normaliseUrl(form.getAttribute('action') || '');
            var courses = normaliseUrl(form.dataset.coursesSearch || '');
            var global = normaliseUrl(form.dataset.globalSearch || '');
            if (act && courses && act == courses) return 'courses';
            if (act && global && act == global) return 'global';
            var b = switcher && switcher.querySelector('.js-search-collection-switcher-button[active]');
            return b ? (b.getAttribute('collection') || 'courses') : 'courses';
        }

        function updateBannerCopyByCollection(collection) {
            if (!banner) return;
            var h1 = banner.querySelector('h1');
            var p = banner.querySelector('p');
            if (!h1 || !p) return;
            if (collection === 'courses') {
                h1.textContent = 'Discover courses';
                p.textContent = 'Search undergraduate, postgraduate, research, and short courses across JCU';
                banner.setAttribute('data-search-type', 'courses');
            } else {
                h1.textContent = 'Discover JCU';
                p.textContent = 'Search all JCU content - news, services, guides, events and more';
                banner.setAttribute('data-search-type', 'global');
            }
        }

        function syncBannerToFormAction() {
            updateBannerCopyByCollection(getCollectionFromAction());
        }

        if (window.MutationObserver) {
            var mo = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].type === 'attributes' && muts[i].attributeName === 'action') {
                        syncBannerToFormAction();
                        break;
                    }
                }
            });
            mo.observe(form, {
                attributes: true,
                attributeFilter: ['action']
            });
        }

        (function wrapUpdateFormAction() {
            var _orig = updateFormAction;
            updateFormAction = function () {
                if (_orig) _orig();
                syncBannerToFormAction();
            };
        })();

        syncBannerToFormAction();
        // Banner copy updater
        banner = document.getElementById('banner-header--wrapper');

        function getActiveCollection() {
            var btn = getActiveButton();
            return btn ? (btn.getAttribute('collection') || 'courses') : 'courses';
        }

        function updateBannerCopy(collection) {
            if (!banner) return;
            var h1 = banner.querySelector('h1');
            var p = banner.querySelector('p');
            if (!h1 || !p) return;

            if (collection === 'courses') {
                h1.textContent = 'Discover courses';
                p.textContent = 'Search undergraduate, postgraduate, research, and short courses across JCU';
                banner.setAttribute('data-search-type', 'courses');
            } else {
                h1.textContent = 'Discover JCU';
                p.textContent = 'Search all JCU content - news, services, guides, events and more';
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
            buttons.forEach(function (b) {
                b.removeAttribute('active');
            });
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
        try {
            var parsedPlain = JSON.parse(cookieValue);
            if (Array.isArray(parsedPlain)) return parsedPlain;
        } catch (e) {}
        try {
            var decoded = decodeURIComponent(cookieValue);
            var parsedDecoded = JSON.parse(decoded);
            if (Array.isArray(parsedDecoded)) {
                saveAssetIds(parsedDecoded);
                return parsedDecoded;
            }
        } catch (e2) {}
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
    function findResultsRoot() {
        return (
            document.getElementById("search-results") ||
            document.getElementById("search-results-grid") ||
            document.getElementById("search-results-condensed")
        );
    }

    function ensureDebugElement() {
        if (!debugEnabled) return null;

        if (debugElement && document.body.contains(debugElement)) {
            return debugElement;
        }

        var resultsRoot = findResultsRoot();
        if (!resultsRoot) return null;

        var parent = resultsRoot.parentNode;
        if (!parent) return null;

        var div = document.createElement("div");
        div.id = debugTargetId;
        div.style.fontFamily = "monospace";
        div.style.fontSize = "12px";
        div.style.marginBottom = "8px";

        parent.insertBefore(div, resultsRoot);

        debugElement = div;
        return debugElement;
    }

    function updateDebugOutput() {
        if (!debugEnabled) return;
        var target = ensureDebugElement();
        if (!target) return;
        var ids = getSavedAssetIds();
        target.textContent = ids.length ? ("Saved asset IDs: " + ids.join(", ")) : "Saved asset IDs: (none)";
    }

    // UI helpers
    function setButtonSavedState(button, isSaved) {
        if (isSaved) {
            button.classList.remove("checkbox-blank-black-before");
            button.classList.add("checkbox-checked-black-before", "saved");
            button.textContent = "Saved";
        } else {
            button.classList.remove("checkbox-checked-black-before", "saved");
            button.classList.add("checkbox-blank-black-before");
            button.innerHTML = '<span class="d-none-med">compare</span>';
        }
    }

    // Initialise and bind
    document.addEventListener("DOMContentLoaded", function () {
        // debug
        if (debugEnabled) {
            ensureDebugElement();
            updateDebugOutput();
        }

        // Initialise all compare/save buttons across any view (list, grid, condensed)
        var buttons = document.querySelectorAll(".js-fbsearch-result-item .js-fbsearch-compare-save");
        var savedIds = getSavedAssetIds();

        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var assetId = btn.dataset.courseAssetId;
            if (!assetId) continue;
            setButtonSavedState(btn, savedIds.indexOf(assetId) !== -1);
        }
    });

    // Delegate click so it works regardless of view container
    document.addEventListener("click", function (e) {
        var btn = e.target.closest(".js-fbsearch-result-item .js-fbsearch-compare-save");
        if (!btn) return;

        e.preventDefault();
        var assetId = btn.dataset.courseAssetId;
        if (!assetId) return;

        var nowSaved = toggleAssetId(assetId);
        setButtonSavedState(btn, nowSaved);
    });

})();