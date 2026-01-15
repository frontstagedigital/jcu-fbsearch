
// === helpers shared across modules ===

// simple title case for UI labels - preserves acronyms, keeps small words lower-case mid-phrase
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

// simple first character uppercase
function capFirstLabel(str) {
  var s = String(str == null ? "" : str);
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Use title case for Study area and Location; cap-first for others
function formatFacetLabel(label, facetName) {
  var facetSlug = slug(facetName);
  if (facetSlug === "study-area" || facetSlug === "location") {
    return titleCaseLabel(label);
  }
  return capFirstLabel(label);
}

function encodeForParam(val) {
  return encodeURIComponent(String(val == null ? "" : val)).replace(/%20/g, "+");
}

function parseQsp(qsp) {
  if (!qsp || typeof qsp !== "string") return { name: "", value: "" };
  var i = qsp.indexOf("=");
  if (i < 0) return { name: "", value: "" };
  var rawName = qsp.slice(0, i);
  var name = decodeURIComponent(rawName.replace(/\+/g, " ").replace(/%7C/gi, "|"));
  var value = qsp.slice(i + 1); // keep RHS encoded verbatim
  return { name: name, value: value };
}

// Parse all f.* pairs from a URL or query string, preserving RHS encoding
function parseAllFParams(urlOrQs) {
  var out = [];
  if (!urlOrQs) return out;
  var q = String(urlOrQs);
  var qi = q.indexOf("?");
  if (qi >= 0) q = q.slice(qi + 1);
  if (!q) return out;
  var parts = q.split("&");
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i];
    if (!seg) continue;
    var eq = seg.indexOf("=");
    if (eq < 0) continue;
    var rawName = seg.slice(0, eq);
    var rhs = seg.slice(eq + 1); // keep encoded
    var name = decodeURIComponent(rawName.replace(/\+/g, " ").replace(/%7C/gi, "|"));
    if (name.indexOf("f.") === 0) out.push({ name: name, value: rhs, raw: seg });
  }
  return out;
}

// Prefer toggleUrl; if the exact pair for THIS value isn't present in toggleUrl
// (common when the value is already selected and toggleUrl is a "remove" link),
// fall back to the exact queryParam pair.
function findFacetPair(facetName, label, data, toggleUrl, queryParam) {
  function encToken(s){ return encodeURIComponent(String(s == null ? "" : s)).replace(/%20/g, "+"); }
  function parseAllF(urlOrQs) {
    var out = [];
    if (!urlOrQs) return out;
    var q = String(urlOrQs);
    var qi = q.indexOf("?");
    if (qi >= 0) q = q.slice(qi + 1);
    if (!q) return out;
    var parts = q.split("&");
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg) continue;
      var eq = seg.indexOf("=");
      if (eq < 0) continue;
      var rawName = seg.slice(0, eq);
      var rhs = seg.slice(eq + 1); // keep encoded
      var name = decodeURIComponent(rawName.replace(/\+/g, " ").replace(/%7C/gi, "|"));
      if (name.indexOf("f.") === 0) out.push({ name: name, value: rhs, raw: seg });
    }
    return out;
  }
  function parseQsp(qsp){
    var i = (qsp || "").indexOf("=");
    if (i < 0) return { name:"", value:"" };
    return {
      name: decodeURIComponent(qsp.slice(0,i).replace(/\+/g," ").replace(/%7C/gi,"|")),
      value: qsp.slice(i+1) // keep encoded
    };
  }

  var labelToken = encToken(label);
  var dataToken  = (data != null && data !== "") ? encToken(data) : "";
  var want = [];
  if (dataToken) want.push(dataToken);
  want.push(labelToken);

  // 1) Try to find THIS pair inside toggleUrl
  var pairs = parseAllF(toggleUrl || "");

  // 1a) exact LHS + exact RHS match (prefer data, then label)
  for (var t = 0; t < want.length; t++) {
    var tok = want[t];
    for (var i = pairs.length - 1; i >= 0; i--) {
      if (pairs[i].value === tok) {
        // If there’s only one LHS candidate for this facet base, accept;
        // otherwise accept any - we only care the RHS matches our value.
        return { name: pairs[i].name, value: pairs[i].value, source: "toggleUrl:rhsExact" };
      }
    }
  }

  // 1b) single f.* pair present - accept it
  if (pairs.length === 1) {
    return { name: pairs[0].name, value: pairs[0].value, source: "toggleUrl:single" };
  }

  // 1c) prefer LHS that matches this facet base if present
  var facetBase = "f." + String(facetName || "");
  for (var k = pairs.length - 1; k >= 0; k--) {
    var base = pairs[k].name.split("|")[0];
    if (base === facetBase) {
      return { name: pairs[k].name, value: pairs[k].value, source: "toggleUrl:lhsHint" };
    }
  }

  // 2) Fall back to the exact queryParam pair for THIS value
  if (queryParam) {
    var q = parseQsp(queryParam);
    if (q.name && q.value) {
      // only accept if RHS equals our label/data token (guards against stale pairs)
      if (q.value === labelToken || (dataToken && q.value === dataToken)) {
        return { name: q.name, value: q.value, source: "queryParam:rhsExact" };
      }
    }
  }

  // Nothing usable
  return { name: "", value: "", source: "none" };
}


/* === render/results.js === */
var Results = (function () {
  // -------- JCU helpers --------
  function firstKey(obj, orElse) {
    if (!obj) return orElse;
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) return k;
    return orElse;
  }

  function firstNonEmptyArray() {
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (a && a.length) {
        var cleaned = [];
        for (var j = 0; j < a.length; j++) {
          var s = String(a[j] || "").trim();
          if (s) cleaned.push(s);
        }
        if (cleaned.length) return cleaned;
      }
    }
    return [];
  }

  function courseAssetId(result) {
    var md = (result && result.listMetadata) || {};
    // try a few, take the first non-empty
    var ids = firstNonEmptyArray(md.courseAssetID, md.courseAssetId, md.assetID, md.assetId);
    return ids.length ? String(ids[0]) : "";
  }

  function uniqJoined(arr) {
    if (!arr) return "";
    var seen = Object.create ? Object.create(null) : {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = String(arr[i] || "").replace(/^,\s*/, "").trim();
      if (!v) continue;
      if (!seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    }
    return out.join(", ");
  }

  function uniqJoinedPipe(arr) {
    if (!arr) return "";
    var seen = Object.create ? Object.create(null) : {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = String(arr[i] || "").trim();
      if (!v) continue;
      if (!seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    }
    return out.join(" | ");
  }

  function truncate(str, n) {
    var s = String(str || "");
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 60) cut = cut.slice(0, lastSpace);
    return cut + "…";
  }

  function linkAndTitle(result) {
    var link = result.clickTrackingUrl || result.liveUrl || "#";

    // prefer metadata pageName (array or string)
    var md = (result && result.listMetadata) || {};
    var pageNames = firstNonEmptyArray(md.pageName, md.pagename, md.PageName);
    var fromMeta = pageNames.length ? String(pageNames[0]).trim() : "";

    // fall back to result.title, stripping the site suffix if present
    var fallback = (result.title || "Untitled").replace(/ - JCU Australia$/, "");

    return {
      link: link,
      title: fromMeta || fallback
    };
  }

  function studyLevelInfo(result) {
    var md = (result && result.listMetadata) || {};
    var sl = firstNonEmptyArray(md.studyLevel);
    var raw = sl.length ? sl[0] : "";
    var lower = String(raw || "").toLowerCase().replace(/\s+/g, " ");

    // colour stays driven by the canonical lower-case value
    var colour = lower.indexOf("under") === 0
      ? "square-blue-before"
      : (lower.indexOf("post") === 0 || lower.indexOf("master") === 0 || lower.indexOf("graduate") === 0
          ? "square-green-before"
          : "");

    // display label - collapse variants like "post graduate", "post-grad" -> "Postgraduate"
    function normaliseStudyLevelLabel(s) {
      var l = String(s || "").toLowerCase().replace(/\s+/g, " ");
      if (/^post[\s-]*grad(uate)?/.test(l)) return "Postgraduate";
      if (/^under[\s-]*grad(uate)?/.test(l)) return "Undergraduate";
      return titleCaseLabel(s);
    }

    return {
      label: normaliseStudyLevelLabel(raw),
      colour: colour
    };
  }

  function quickFactsBlocks(result) {
    var md = (result && result.listMetadata) || {};
    var atar = firstNonEmptyArray(md.courseAtarCutoff);
    var durations = firstNonEmptyArray(md.courseDuration);
    var locs = firstNonEmptyArray(md.campus, md.campusInt, md.campusDom);
    var months = firstNonEmptyArray(md.commencingDate);

    // de-duped pipe-join for durations
    var durJoined = (function (arr) {
      if (!arr) return "";
      var seen = Object.create ? Object.create(null) : {};
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var v = String(arr[i] || "").trim();
        if (!v) continue;
        if (!seen[v]) { seen[v] = true; out.push(v); }
      }
      return out.join(" | ");
    })(durations);

    var blocks = [];
    if (atar.length) {
      blocks.push({ cls: "target-black-before", text: "ATAR " + atar[0] });
    }
    var locJoined = uniqJoined(locs);
    if (durJoined) {
      blocks.push({ cls: "clock-black-before", text: durJoined });
    }
    if (locJoined) {
      blocks.push({ cls: "location-black-before", text: locJoined });
    }
    var monthsJoined = uniqJoined(months);
    if (monthsJoined) {
      blocks.push({ cls: "calendar-black-before", text: monthsJoined });
    }
    return blocks;
  }


  function description150(result) {
    var md = (result && result.listMetadata) || {};
    var c = firstNonEmptyArray(md.c);
    return truncate(c.length ? c[0] : "", 150);
  }

  // ---------- views ----------
  function listItem(result) {
    var lvl = studyLevelInfo(result);
    var lt = linkAndTitle(result);
    var desc = description150(result);
    var facts = quickFactsBlocks(result);
    var cid = courseAssetId(result);

    var b = Html.buffer();
    b.add('<div class="grid-12 bg-white border p-150 m-b-100 js-fbsearch-result-item">');

    b.add('<div class="col-6-lrg col-12">');
    if (lvl.label) b.add('<div class="f-uppercase f-overline flex gap-025 align-center ' + (lvl.colour || '') + ' p-b-100">' + Html.esc(lvl.label) + '</div>');
    b.add('<a href="' + Html.esc(lt.link) + '"><h3 class=" p-b-150 m-t-0">' + Html.esc(lt.title) + '</h3></a>');
    if (desc) b.add('<p>' + Html.esc(desc) + '</p>');
    b.add('</div>');

    b.add('<div class="col-5-lrg col-12">');
    if (facts.length) {
      b.add('<div class="f-uppercase f-overline p-b-100">Quick Facts</div>');
      b.add('<ul class="list-none p-l-0 f-semibold">');
      for (var i = 0; i < facts.length; i++) {
        b.add('<li class="flex gap-050 align-center ' + Html.esc(facts[i].cls) + '">' + Html.esc(facts[i].text) + '</li>');
      }
      b.add('</ul>');
    }
    b.add('</div>');

    b.add('<div class="col-1-lrg col-12">');
    b.add('<div class="f-uppercase f-overline btn secondary-three round-med xsm checkbox-blank-black-before flex space-evenly align-center js-fbsearch-compare-save"' + (cid ? ' data-course-asset-id="' + Html.esc(cid) + '"' : '') +'><span class="d-none-med">compare</span></div>');
    b.add('</div>');

    b.add('<div class="col-12"><p class="btn-cta m-0">');
    b.add('<a href="' + Html.esc(lt.link) + '" class="f-primary-dark">View course</a>');
    b.add('</p></div>');

    b.add('</div>');
    return b.toString();
  }

  function list(api) {
    var results = Safe.get(api, "response.resultPacket.results", []);
    var b = Html.buffer();
    b.add('<div id="search-results" class="p-t-100 p-b-100">');
    for (var i = 0; i < results.length; i++) b.add(listItem(results[i]));
    b.add('</div>');
    b.add(Pager.render(api, GLOBALS));
    return b.toString();
  }

  function gridItem(result) {
    var lvl = studyLevelInfo(result);
    var lt = linkAndTitle(result);
    var desc = description150(result);
    var facts = quickFactsBlocks(result);
    var cid = courseAssetId(result);

    var b = Html.buffer();
    b.add('<div class="col-12 col-4-lrg bg-white border p-150 js-fbsearch-result-item">');

    b.add('  <div class="p-b-100">');
    b.add('    <div class="flex flex-wrap space-between align-center p-b-100 gap-0125">');
    if (lvl.label) b.add('      <div class="f-uppercase f-overline flex gap-025 align-center ' + (lvl.colour || '') + '">' + Html.esc(lvl.label) + '</div>');
    else b.add('      <div></div>');
    b.add('      <div class="f-uppercase f-overline btn secondary-three round-med xsm checkbox-blank-black-before flex space-evenly align-center js-fbsearch-compare-save"' + (cid ? ' data-course-asset-id="' + Html.esc(cid) + '"' : '') + '><span class="d-none-med">compare</span></div>');
    b.add('    </div>');
    b.add('    <a href="' + Html.esc(lt.link) + '"><h3 class=" p-b-150 m-t-0">' + Html.esc(lt.title) + '</h3></a>');
    if (desc) b.add('    <p>' + Html.esc(desc) + '</p>');
    b.add('  </div>');

    if (facts.length) {
      b.add('  <div class="p-b-150">');
      b.add('    <ul class="list-none p-l-0 f-semibold">');
      for (var i = 0; i < facts.length; i++) {
        b.add('<li class="flex gap-050 align-center ' + Html.esc(facts[i].cls) + '">' + Html.esc(facts[i].text) + '</li>');
      }
      b.add('    </ul>');
      b.add('  </div>');
    }

    b.add('  <div class="flex flex-wrap space-between align-center p-b-100 gap-0125">');
    b.add('    <p class="btn-cta m-0">');
    b.add('      <a href="' + Html.esc(lt.link) + '" class="f-primary-dark">View course</a>');
    b.add('    </p>');
    b.add('  </div>');

    b.add('</div>');
    return b.toString();
  }

  function grid(api) {
    var results = Safe.get(api, "response.resultPacket.results", []);
    var b = Html.buffer();
    b.add('<div id="search-results-grid" class="p-t-100 p-b-100 grid-12">');
    for (var i = 0; i < results.length; i++) b.add(gridItem(results[i]));
    b.add('</div>');
    b.add(Pager.render(api, GLOBALS));
    return b.toString();
  }

  function condensedItem(result) {
    var lvl = studyLevelInfo(result);
    var lt = linkAndTitle(result);
    var md = (result && result.listMetadata) || {};
    var atar = firstNonEmptyArray(md.courseAtarCutoff);
    var cid = courseAssetId(result);

    var b = Html.buffer();
    b.add('<div class="bg-white border p-150 flex flex-wrap space-between m-b-100 align-center js-fbsearch-result-item">');
    b.add('  <a class="m-b-0" href="' + Html.esc(lt.link) + '"><h3 class="m-t-0">' + Html.esc(lt.title) + '</h3></a>');
    b.add('  <div class="flex flex-wrap gap-200 align-center">');
    if (atar.length) b.add('    <span class="f-overline">ATAR ' + Html.esc(atar[0]) + '</span>');
    if (lvl.label) b.add('    <div class="p-l-025 f-uppercase f-overline flex gap-025 align-center ' + (lvl.colour || '') + '">' + Html.esc(lvl.label) + '</div>');
    b.add(    '    <div class="f-uppercase f-overline btn secondary-three round-med xsm checkbox-blank-black-before flex space-evenly align-center js-fbsearch-compare-save"' + (cid ? ' data-course-asset-id="' + Html.esc(cid) + '"' : '') + '><span class="d-none-med">compare</span></div>');
    b.add('    <p class="btn-cta m-0"><a href="' + Html.esc(lt.link) + '" class="f-primary-dark">View Course</a></p>');
    b.add('  </div>');
    b.add('</div>');
    return b.toString();
  }

  function condensed(api) {
    var results = Safe.get(api, "response.resultPacket.results", []);
    var b = Html.buffer();
    b.add('<div id="search-results-condensed" class="p-t-100 p-b-100">');
    for (var i = 0; i < results.length; i++) b.add(condensedItem(results[i]));
    b.add('</div>');
    b.add(Pager.render(api, GLOBALS));
    return b.toString();
  }

  //Page view for non-course results
  function pageItem(result) {
    var lt = linkAndTitle(result);
    var desc = description150(result);

    var b = Html.buffer();
    b.add('<div class="grid-12 border bg-white p-150 m-b-100 js-fbsearch-result-item">');
    b.add('<div class="col-6-lrg col-12">');
    b.add('<a href="' + Html.esc(lt.link) + '"><h3 class="p-b-150 m-t-0">' + Html.esc(lt.title) + '</h3></a>');
    if (desc) b.add('<p>' + Html.esc(desc) + '</p>');
    b.add('</div>');
    b.add('<div class="col-12"><p class="btn-cta m-0">');
    b.add('<a href="' + Html.esc(lt.link) + '" class="f-primary-dark">View Page</a>');
    b.add('</p></div>');    
    b.add('</div>');
    return b.toString();
  }

  function page(api) {
    var results = Safe.get(api, "response.resultPacket.results", []);
    var b = Html.buffer();
    b.add('<div id="search-results-page" class="p-t-100 p-b-100">');
    for (var i = 0; i < results.length; i++) b.add(pageItem(results[i]));
    b.add('</div>');
    b.add(Pager.render(api, GLOBALS));
    return b.toString();
  }

  function render(api, G) {
    function getViewParamName(Gx) {
      return (Gx && typeof Gx.view_param === "string" && Gx.view_param) ? Gx.view_param : "ui_view";
    }

    function getViewFrom(Gx) {
      var v = (Gx && typeof Gx.get_view === "string" && Gx.get_view) ? Gx.get_view : null;
      var qs = (Gx && Gx.server_query_string) ? Gx.server_query_string : "";
      try {
        var parsed = Url.parseQueryString(qs);
        if (!v) {
          var key = getViewParamName(Gx);
          if (parsed && parsed[key]) v = parsed[key];
        }
      } catch (e) {}

      // if still not set, prefer the first view in viewOptions
      if (!v && Gx && Gx.viewOptions) {
        v = firstKey(Gx.viewOptions, null);
      }

      return v || "default";
    }

    var view = getViewFrom(G);
    if (view === "grid") return grid(api);
    if (view === "condensed") return condensed(api);
    if (view === "page") return page(api);
    return list(api);
  }

  return {
    render: render,
    list: list,
    grid: grid,
    condensed: condensed
  };
})();


/* === render/featured-filters.js === */
var FeaturedFilters = (function () {

  // adds checked="checked" when v.selected is true
  function block(facet) {
    var facetName = facet.name;
    var facetSlug = slug(facetName);
    var isMulti = (facet.guessedDisplayType === "CHECKBOX");
    var b = Html.buffer();

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
      var toggle = (ld.toggleUrl  || v.toggleUrl  || "");
      var qsp    = (ld.queryParam || v.queryParam || "");

      // Preferred strict derivation
      var pair = findFacetPair(facetName, label, v.data, toggle, qsp);
      if (!pair.name || !pair.value) {
        // skip this option if we cannot reliably derive the pair
        continue;
      }

      var checkedAttr = v.selected ? ' checked="checked"' : '';

      if (isMulti) {
        // MULTI - checkboxes
        if (facetSlug === "study-area") {
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
        b.add(
          '          <input type="checkbox"' +
          ' name="' + Html.esc(pair.name) + '"' +
          ' value="' + Html.esc(pair.value) + '"' + checkedAttr +
          '>'
        );
        b.add('          <span>' + Html.esc(formatFacetLabel(label, facetName)) + '</span>');
        b.add('        </label>');
        b.add('      </div>');
      } else {
        // SINGLE - clickable rows (unchanged, but keep pair values and toggle as data)
        b.add(
          '      <div tabindex="0"' +
          ' data-' + facetSlug + '="' + Html.esc(slug(label)) + '"' +
          ' class="p-t-100 p-b-100 p-l-075 p-r-075 select-label-text f-bold"' +
          ' data-param-name="' + Html.esc(pair.name) + '"' +
          ' data-param-value="' + Html.esc(pair.value) + '"' +
          ' data-toggleurl="' + Html.esc(toggle) + '"' +
          '>'
        );
        b.add('        ' + Html.esc(formatFacetLabel(label, facetName)));
        b.add('      </div>');
      }
    }

    if(facetSlug === "study-area" && values.length > 14) {
        b.add('</div>');
    }

    if (isMulti) {
      b.add('      <section class="search-filter-buttons flex-shrink-0 col-12">');
      b.add('        <div class="flex gap-050 p-t-100 p-l-050 p-r-050 p-b-050">');
      b.add('          <button class="btn m-b-0 w-100" id="filters-apply">Apply</button>');
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


/* === render/header-row.js (strict pairing) === */
var HeaderRow = (function () {

  // Strict per-value resolver:
  // - Always use labels[label].queryParam (or v.queryParam) for the RHS token (canonical, correct case)
  // - Use toggleUrl only to confirm/override the LHS name by matching the exact RHS token
  function findFacetPairStrict(facetName, label, data, toggleUrl, queryParam) {
    var out = { name: "", value: "", source: "none" };
    var q = parseQsp(queryParam);
    if (!q.value) return out; // without a canonical RHS we can't be accurate

    var name = q.name;     // may be empty/inexact
    var value = q.value;   // authoritative encoded token for THIS label
    var source = "queryParam:rhsCanonical";

    if (toggleUrl) {
      var all = parseAllFParams(toggleUrl);
      // find the last pair whose RHS equals the canonical token
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].value === value) { name = all[i].name; source = "toggleUrl:rhsMatch"; break; }
      }
      // if not found, leave name from queryParam
    }

    out.name = name || ("f." + String(facetName || ""));
    out.value = value;
    out.source = source;
    return out;
  }

  function featured(sd, G) {
    if (G && G.hideFacets) return "";

    var b = Html.buffer();
    b.add('<div class="flex space-apart p-b-250">');
    b.add(FeaturedFilters.render(sd, G));
    b.add('<div id="all-filters-button" aria-expanded="false" class="search-controls w-100-sm btn secondary-one flex gap-100 space-between pointer align-center tune-black">');
    b.add('<div class="f-display-4 f-bold">All Filters</div>');
    b.add('</div>');
    b.add('</div>');
    return b.toString();
  }

  function selected(sd) {
    var chips = [];

    for (var i = 0; i < sd.facets.length; i++) {
      var facet = sd.facets[i];
      var vals = facet.allValues || [];
      for (var j = 0; j < vals.length; j++) {
        var v = vals[j];
        if (!v || !v.selected) continue;

        var label = v.label || "";
        var ld = (facet.labels && facet.labels[label]) || {};
        var queryParam = ld && ld.queryParam ? String(ld.queryParam) : (v.queryParam || "");
        var toggleUrl  = (ld && ld.toggleUrl) || v.toggleUrl || "";

        var pair = findFacetPairStrict(facet.name, label, v.data, toggleUrl, queryParam);
        if (!pair.name || !pair.value) continue;

        chips.push({
          label: label,
          name: pair.name,
          value: pair.value,
          facetName: facet.name,
          dbg: {
            source: pair.source,
            toggleUrl: toggleUrl,
            queryParam: queryParam,
            chosenName: pair.name,
            chosenValue: pair.value
          }
        });
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
        ' data-remove-value="' + Html.esca(c.value) + '"' +
        ' data-dbg-source="' + Html.esca(c.dbg.source) + '"' +
        ' data-dbg-toggle="' + Html.esca(c.dbg.toggleUrl) + '"' +
        ' data-dbg-qsp="' + Html.esca(c.dbg.queryParam) + '"' +
        ' data-dbg-final-name="' + Html.esca(c.dbg.chosenName) + '"' +
        ' data-dbg-final-value="' + Html.esca(c.dbg.chosenValue) + '"' +
        '>' +
        Html.esc(formatFacetLabel(c.label, c.facetName)) +
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
  function idFromName(n) {
    return String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function section(facet) {
    var id = idFromName(facet.name);
    var b = Html.buffer();

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

      // Preferred strict derivation, identical to FeaturedFilters
      var ld = (facet.labels && facet.labels[label]) || {};
      var toggleUrl = (ld && ld.toggleUrl) || v.toggleUrl || "";
      var queryParam = (ld && ld.queryParam) || v.queryParam || "";

      var pair = findFacetPair(facet.name, label, v.data, toggleUrl, queryParam);
      if (!pair.name || !pair.value) continue;

      var checked = v.selected ? ' checked="checked"' : "";

      // Use label for display, value token for submission
      b.add('<div class="p-b-075">');
      b.add('<label class="flex align-start gap-050-column pointer select-label-text">');
      b.add('<input type="checkbox" name="' + Html.esca(pair.name) + '" value="' + Html.esca(pair.value) + '"' + checked + '>');
      b.add('<div class="js-fbsearch-filters-modal--label-text" data-filter-name="' + Html.esca(label) + '">');
      b.add('<div class="f-semibold">' + Html.esc(formatFacetLabel(label, facet.name)) + '</div>');
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
    b.add('<button id="filters-apply" class="btn m-b-0 w-100 m-100">Apply</button>');
    b.add('<button id="cancel-filter-button" class="btn secondary-one m-b-0 w-100 m-100">Cancel</button>');
    b.add('</div>');
    b.add('</section>');

    b.add('</div></div></div></div></div>');
    return b.toString();
  }

  return { render: render };
})();


/* === render/count-bar.js === */
var CountBar = (function () {

  function ownKeyCount(obj){
    var n = 0; if (!obj) return 0;
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) n++;
    return n;
  }

  function firstKey(obj, orElse) {
    if (!obj) return orElse;
    for (var k in obj)
      if (Object.prototype.hasOwnProperty.call(obj, k)) return k;
    return orElse;
  }

  function selectBlock(kind, paramName, selectedValue, optionsMap) {
    var b = Html.buffer();
    var selectedText = "";
    if (optionsMap) {
      if (Object.prototype.hasOwnProperty.call(optionsMap, selectedValue)) {
        selectedText = optionsMap[selectedValue];
      } else {
        selectedText = optionsMap[firstKey(optionsMap, "")] || "";
      }
    }
    b.add('<div class="no-select select-wrapper search-controls col-12 col-6-med col-2-lrg">');
    b.add('      <div class="select-label-text active-label-text flex space-between align-center plus-black btn sm secondary-one">');
    b.add('        <div class="f-display-4">');
    b.add('          <span class="p-l-025 p-r-025">' + Html.esc(kind) + ': </span> <span>' + Html.esc(selectedText) + '</span>');
    b.add('        </div>');
    b.add('      </div>');
    b.add('      <div class="study-level-wrapper border-box bg-white p-b-0" style="height: 0px; overflow: hidden;">');
    b.add('        <div class="d-none">');
    if (optionsMap) {
      for (var val in optionsMap)
        if (Object.prototype.hasOwnProperty.call(optionsMap, val)) {
          var label = optionsMap[val];
          b.add('          <div tabindex="0" class="p-t-100 p-b-100 p-l-075 p-r-075 select-label-text"' +
            ' data-param-name="' + Html.esca(paramName) + '"' +
            ' data-param-value="' + Html.esca(val) + '">');
          b.add('            <span class="p-l-025 p-r-025">' + Html.esc(kind) + ': </span> <span>' + Html.esc(label) + '</span>');
          b.add('          </div>');
        }
    }
    b.add('        </div>');
    b.add('      </div>');
    b.add('</div>');
    return b.toString();
  }

  function render(api, G) {
    var sum = Safe.get(api, "response.resultPacket.resultsSummary", {});
    var total = sum.totalMatching || 0;
    var currentStart = sum.currStart || 1;
    var currentEnd = sum.currEnd || (total < 10 ? total : 10);

    var sortOptions = (G && G.sortOptions) || {
      "": "Relevance",
      "date": "Most recent"
    };
    var viewOptions = (G && G.viewOptions) || {
      "default": "Default",
      "grid": "Grid",
      "condensed": "Condensed",
      "list": "List"
    };

    var currentSort = (G && typeof G.get_sort === "string") ? G.get_sort : "";
    var parsedQS = Url.parseQueryString((G && G.server_query_string) || "");
    var key = (G && typeof G.view_param === "string" && G.view_param) ? G.view_param : "ui_view";
    var paramName = key;
    var currentView =
      (G && typeof G.get_view === "string" && G.get_view) ||
      (parsedQS[key]) ||
      firstKey(viewOptions, "default");
    var b = Html.buffer();
    b.add('<div class="columns space-between align-center">');
    b.add('<div id="search-result-count" class="searchresults__count f-bold">');
    b.add('Showing <span id="search-page-start">' + currentStart + '</span> - <span id="search-page-end">' + currentEnd + '</span> of <span id="search-total-matching">' + total + '</span> results');
    b.add('</div>');
    b.add('<div class="flex gap-100 flex-wrap">');
    b.add(selectBlock('Sort by', 'sort', currentSort, sortOptions));
    if (ownKeyCount(viewOptions) > 1) {
      b.add(selectBlock('View', paramName, currentView, viewOptions));
    }
    b.add('</div>');
    b.add('</div>');
    return b.toString();
  }

  return {
    render: render
  };
})();
