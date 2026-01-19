
/* === render.js === */

/* util: encode URL tokens like server does: spaces -> '+' */
function encodeForParam(val) {
  return encodeURIComponent(String(val == null ? "" : val)).replace(/%20/g, "+");
}

/* value token rule: use label for all facets, except "Student type" which uses data if present */
function valueTokenForFacet(facetName, data, label) {
  var name = String(facetName || "");
  if (name.toLowerCase() === "student type") {
    return encodeForParam(data != null && data !== "" ? data : label);
  }
  return encodeForParam(label);
}

/* simple title case for UI labels - preserves acronyms, keeps small words lower-case mid-phrase */
function titleCaseLabel(str) {
  var STOP = {
    "and":1, "or":1, "of":1, "the":1, "in":1, "on":1, "at":1,
    "for":1, "to":1, "a":1, "an":1, "by":1, "from":1, "with":1
  };
  function capWord(w) {
    if (!w) return w;
    if (/[A-Z]{2,}/.test(w)) return w;                // keep acronyms like JCU, ATAR
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }
  function capHyphenated(w) {
    var parts = w.split("-");
    for (var i = 0; i < parts.length; i++) parts[i] = capWord(parts[i]);
    return parts.join("-");
  }
  var parts = String(str || "").trim().split(/\s+/);
  if (!parts.length) return str;
  for (var i = 0; i < parts.length; i++) {
    var raw = parts[i], lower = raw.toLowerCase();
    var isEdge = (i === 0 || i === parts.length - 1);
    parts[i] = (!isEdge && STOP[lower])
      ? lower
      : (raw.indexOf("-") > -1 ? capHyphenated(raw) : capWord(raw));
  }
  return parts.join(" ");
}

function idFromName(n) {
  return String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* === render/featured-filters.js === */
var FeaturedFilters = (function () {
  function slug(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&amp;/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function splitQsp(qsp) {
    if (!qsp || typeof qsp !== "string") return { name: "", value: "" };
    var i = qsp.indexOf("=");
    if (i < 0) return { name: "", value: "" };
    var rawName = qsp.slice(0, i);
    var name = decodeURIComponent(rawName.replace(/\+/g, " ").replace(/%7C/gi, "|"));
    var value = qsp.slice(i + 1);
    return { name: name, value: value };
  }

  function block(facet) {
    var facetName = facet.name;
    var facetSlug = slug(facetName);
    var isMulti = (facet.guessedDisplayType === "CHECKBOX");
    var b = Html.buffer();

    // seen set per facet to avoid duplicate checkboxes (same name+value)
    var seen = Object.create ? Object.create(null) : {};

    // wrapper - add "multiselect" class only for checkbox facets
    b.add(
      '<div class="' + (isMulti ? 'multiselect ' : '') +
      'no-select select-wrapper search-controls col-12 col-6-med col-2-lrg js-fbsearch-featured-facet" data-featured-facet="' +
      Html.esc(facetName) + '">'
    );

    // header
    b.add('  <div class="select-label-text active-label-text flex space-between align-center plus-black btn secondary-one">');
    b.add('    <div class="f-display-4 f-bold">' + Html.esc(facetName) + '</div>');
    b.add('  </div>');

    // body wrapper - closed by default
    b.add('  <div class="study-level-wrapper border-box bg-white p-b-0 m-t-100" style="width: 500px; height: 0px; overflow: hidden;">');

    // inner
    b.add('    <div class="' + (isMulti ? 'max-width d-none' : 'd-none') + '">');

    var values = facet.allValues || [];

    if(facetSlug === "study-area" && values.length > 14) {
      b.add('<div class="m-100 overflow_y-auto overflow_x-h" style="max-height:500px;">');
    }

    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (!v || !v.label) continue;

      var label = v.label;
      var ld = (facet.labels && facet.labels[label]) || {};
      var qsp = ld.queryParam || "";
      var toggle = ld.toggleUrl || "";
      var pair = splitQsp(qsp); // { name, value } (value ignored by build)
      var valueTok = valueTokenForFacet(facetName, v.data, label);
      var key = (pair.name || ("f." + facetName + "|" + (facet.paramDataKey || (facet.name === "Study area" ? "studyArea" : facet.name.toLowerCase())))) + "\u0000" + valueTok;
      if (seen[key]) continue;
      seen[key] = 1;

      var checkedAttr = v.selected ? ' checked="checked"' : '';

      if (isMulti) {
        // MULTI - checkboxes
        if(facetSlug === "study-area"){
          b.add(
            '      <div tabindex="0"' +
            ' data-' + facetSlug + '="' + Html.esc(slug(label)) + '"' +
            ' class="p-b-075 p-l-075 p-r-075 select-label-text f-semibold"' +
            '>'
          );
        } else {
          b.add(
            '      <div tabindex="0"' +
            ' data-' + facetSlug + '="' + Html.esc(slug(label)) + '"' +
            ' class="p-t-100 p-b-100 p-l-075 p-r-075 select-label-text f-bold"' +
            '>'
          );
        }
        b.add('        <label class="pointer d-block">');
        b.add('          <input type="checkbox" name="' + Html.esc(pair.name) + '" value="' + Html.esc(valueTok) + '"' + checkedAttr + '>');
        b.add('          <span>' + Html.esc(titleCaseLabel(label)) + '</span>');
        b.add('        </label>');
        b.add('      </div>');
      } else {
        // SINGLE - clickable rows
        b.add(
          '      <div tabindex="0"' +
          ' data-' + facetSlug + '="' + Html.esc(slug(label)) + '"' +
          ' class="p-t-100 p-b-100 p-l-075 p-r-075 select-label-text f-bold"' +
          ' data-param-name="' + Html.esc(pair.name) + '"' +
          ' data-param-value="' + Html.esc(valueTok) + '"' +
          ' data-toggleurl="' + Html.esc(toggle) + '"' +
          '>'
        );
        b.add('        ' + Html.esc(titleCaseLabel(label)));
        b.add('      </div>');
      }
    }

    if(facetSlug === "study-area" && values.length > 14) {
      b.add('</div>');
    }

    if (isMulti) {
      // IMPORTANT: use class, not duplicated ID
      b.add('      <section class="search-filter-buttons flex-shrink-0 col-12">');
      b.add('        <div class="flex gap-050 p-t-100 p-l-050 p-r-050 p-b-050">');
      b.add('          <button class="btn m-b-0 w-100 filters-apply">Apply</button>');
      b.add('          <button class="cancel-button btn secondary-two m-b-0 w-100">Cancel</button>');
      b.add('        </div>');
      b.add('      </section>');
    }

    b.add('    </div>'); // inner
    b.add('  </div>');   // body
    b.add('</div>');     // wrapper

    return b.toString();
  }

  function render(sd, G) {
    var names = (G && G.featuredFacetNames) || [];
    if (!names || !names.length) return "";
    var byName = {};
    for (var i = 0; i < sd.facets.length; i++) byName[sd.facets[i].name] = sd.facets[i];

    var b = Html.buffer();
    b.add('<div class="columns d-none-lrg">');
    for (var k = 0; k < names.length; k++) {
      var fname = names[k];
      if (byName[fname]) b.add(block(byName[fname]));
    }
    b.add('</div>');
    return b.toString();
  }

  return { render: render };
})();


/* === render/header-row.js === */
var HeaderRow = (function () {
  function featured(sd, G) {
    if (G && G.hideFacets) return "";

    var b = Html.buffer();
    b.add('<div class="flex space-apart p-b-250">');
    b.add(FeaturedFilters.render(sd, G));
    // Keep a single All Filters button outside featured facets (unique ID on the page)
    b.add('<div id="all-filters-button" aria-expanded="false" class="search-controls w-100-sm btn secondary-one flex gap-100 space-between pointer align-center tune-black">');
    b.add('<div class="f-display-4 f-bold">All Filters</div>');
    b.add('</div>');
    b.add('</div>');
    return b.toString();
  }

  function selected(sd) {
    var chips = [];
    var seen = Object.create ? Object.create(null) : {};
    for (var i = 0; i < sd.facets.length; i++) {
      var facet = sd.facets[i];
      var vals = facet.allValues || [];
      for (var j = 0; j < vals.length; j++) {
        var v = vals[j];
        if (!v || !v.selected) continue;
        var label = v.label || "";
        var ld = (facet.labels && facet.labels[label]) || {};
        var qsp = ld.queryParam || ""; // e.g. "f.Location|campus=Brisbane"
        var name = "";
        if (qsp) {
          var eq = qsp.indexOf("=");
          if (eq > -1) {
            name  = decodeURIComponent(qsp.slice(0, eq).replace(/\+/g, " ").replace(/%7C/gi, "|"));
          }
        }
        if (!name)  name  = (facet.paramName && String(facet.paramName)) || ("f." + facet.name + "|" + (facet.paramDataKey || (facet.name === "Study area" ? "studyArea" : facet.name.toLowerCase())));
        var value = valueTokenForFacet(facet.name, v.data, label);

        var key = name + "\u0000" + value;
        if (seen[key]) continue;
        seen[key] = 1;

        chips.push({ label: label, name: name, value: value });
      }
    }
    if (!chips.length) return "";

    var b = Html.buffer();
    b.add('<div id="selected-filters" class="columns flex-nowrap align-center gap-050-column">');
    for (var k = 0; k < chips.length; k++) {
      var c = chips[k];
      b.add(
        '<span class="btn special-search round-med border-none h-fc p-050 flex space-between align-center plus-black active"' +
        ' data-remove-name="' + Html.esca(c.name) + '"' +
        ' data-remove-value="' + Html.esca(c.value) + '">' +
        Html.esc(titleCaseLabel(c.label)) +
        '</span>'
      );
    }
    b.add('<span class="f-underline pointer">Clear all</span>');
    b.add('</div>');
    return b.toString();
  }

  return {
    featured: featured,
    selected: selected
  };
})();


/* === render/filters-modal.js === */
var FiltersModal = (function () {

  function section(facet) {
    var id = idFromName(facet.name);
    var b = Html.buffer();

    // seen per facet for modal too
    var seen = Object.create ? Object.create(null) : {};

    b.add('<div class="border-bottom m-b-0 p-b-0">');
    b.add(
      '<button class="flex space-between w-100 btn-no-style plus-black pointer m-b-0 p-b-150 p-t-150" ' +
      'aria-expanded="false" aria-controls="' + id + '-content">' +
      '<h3 class="m-0 f-display-4">' + Html.esc(facet.name) + '</h3></button>'
    );
    b.add('<div id="' + id + '-content" class="p-t-100" style="display: none;">');

    var values = facet.allValues || [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i] || {};
      var label = v.label || "";
      if (!label) continue;

      // Prefer the precomputed queryParam for the LHS name only
      var ld = (facet.labels && facet.labels[label]) || {};
      var qsp = ld.queryParam || "";

      // Parse name from queryParam if available
      var pName = "";
      if (qsp) {
        var eq = qsp.indexOf("=");
        if (eq > -1) {
          // LHS: decode '+' to space and %7C to '|'
          pName = decodeURIComponent(qsp.slice(0, eq).replace(/\+/g, " ").replace(/%7C/gi, "|"));
        }
      }

      // Fallback if labels[...].queryParam is missing: infer a namespaced param
      if (!pName) {
        pName = (facet.paramName && String(facet.paramName)) || ("f." + facet.name + "|" + (facet.paramDataKey || (facet.name === "Study area" ? "studyArea" : facet.name.toLowerCase())));
      }

      // ALWAYS use our simplified RHS token rule (fix for pathways)
      var pValEncoded = valueTokenForFacet(facet.name, v.data, label);

      var key = pName + "\u0000" + pValEncoded;
      if (seen[key]) continue;
      seen[key] = 1;

      var checked = v.selected ? ' checked="checked"' : "";

      // Use label for display, value token for submission
      b.add('<div class="p-b-075">');
      b.add('<label class="flex align-start gap-050-column pointer select-label-text">');
      b.add('<input type="checkbox" name="' + Html.esca(pName) + '" value="' + Html.esca(pValEncoded) + '"' + checked + '>');
      b.add('<div class="js-fbsearch-filters-modal--label-text" data-filter-name="' + Html.esca(label) + '">');
      b.add('<div class="f-semibold">' + Html.esc(titleCaseLabel(label)) + '</div>');
      b.add('</div>');
      b.add('</label>');
      b.add('</div>');
    }

    b.add('</div></div>');
    return b.toString();
  }

  function render(sd, G) {
    if (G && G.hideFacets) return "";

    var b = Html.buffer();
    b.add('<div class="w-100 h-100 bg-neutral-1 opacity-50 main-menu m-t-500" id="filters-modal">');
    b.add('<div id="filters-modal--wrapper" class="main__menu--wrapper search-filters-modal flex space-end">');
    b.add('<div id="filters-panel" class="menu-panel wrapper bg-sand-4 w-100 panel-opened">');
    b.add('<div class="container flex flex-column h-100">');
    b.add('<div class="gap-100-row p-l-025 p-r-025 flex flex-column flex-1">');
    b.add('<section style="flex-shrink: 0;">');
    b.add('<div class="flex space-between align-center p-t-100 p-b-100"><h3 class="m-0 f-display-3">Filters</h3><button id="close-filters-button" class="btn btn-no-style m-b-0 f-uppercase f-overline" data-panel="close-filters">Close</button></div>');
    b.add('</section>');

    b.add('<section id="filters-scrollable-section" class="overflow_y-auto overflow_x-h flex-1">');
    for (var i = 0; i < sd.facets.length; i++) b.add(section(sd.facets[i]));
    b.add('</section>');

    b.add('<section class="flex-shrink-0" style="flex-shrink: 0;">');
    b.add('<div class="search-filter-buttons flex p-t-100 bg-sand-4">');
    // unique ID for modal apply
    b.add('<button id="filters-apply-modal" class="btn m-b-0 w-100 m-100">Apply</button>');
    b.add('<button id="cancel-filter-button" class="btn secondary-one m-b-0 w-100 m-100">Cancel</button>');
    b.add('</div>');
    b.add('</section>');

    b.add('</div></div></div></div></div>');
    return b.toString();
  }

  return { render: render };
})();

/* === end render.js === */
