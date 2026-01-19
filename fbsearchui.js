/* FBSearchUI v2.6 sync duplicates across panels */

(function () {
  function qsa(sel, root) { return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function qs(sel, root) { return (root||document).querySelector(sel); }

  // Encode name for URL: spaces -> '+', '|' -> '%7C' (via encodeURIComponent + fix spaces)
  function encodeNameForUrl(name) {
    return encodeURIComponent(String(name)).replace(/%20/g, "+");
  }

  // Propagate a checkbox state to all duplicates with same name+value (featured, modal, etc.)
  function setAllByNameValue(name, value, checked) {
    var sel = 'input[type="checkbox"][name="' + CSS.escape(name) + '"][value="' + CSS.escape(value) + '"]';
    qsa(sel).forEach(function (el) { el.checked = checked; });
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
  function buildQueryString(pairs) {
    var params = [];

    // keep "query" if present
    var curr = new URL(window.location.href);
    var keepKeys = ['query'];
    keepKeys.forEach(function (k) {
      var v = curr.searchParams.get(k);
      if (v != null && v !== "") {
        params.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
      }
    });

    // always reset pagination when applying filters - drop start_rank if present
    // (do nothing here intentionally - just don't carry it forward)

    // add de-duped facet params
    for (var i = 0; i < pairs.length; i++) {
      var n = pairs[i][0];
      var v = pairs[i][1];
      var nEnc = encodeNameForUrl(n).replace(/%7C/gi, "%7C"); // keep '|' encoded as %7C
      // value is already a token (with '+'), do not double-encode '+'
      params.push(nEnc + "=" + v);
    }

    return params.length ? ("?" + params.join("&")) : "";
  }

  function applyFilters() {
    var pairs = collectSelectedPairs();
    var qs = buildQueryString(pairs);
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

  // 3) Modal "Apply" button (dedicated id)
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
      qsa('input[type="checkbox"][name][value]:checked').forEach(function (el) { el.checked = false; });
      applyFilters();
    }
  });
})();