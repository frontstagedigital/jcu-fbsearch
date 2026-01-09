var Pager = (function () {
  function normaliseQs(qs) {
    // turn "?a=1&&b=2&" into "a=1&b=2"
    var s = String(qs || "").replace(/^\?+/, "").replace(/&+$/,"");
    // collapse accidental doubles like && that might appear in server strings
    s = s.replace(/&{2,}/g, "&");
    return s;
  }

  function cleanedQuery(qs) {
    try {
      var s = normaliseQs(qs);
      var usp = new URLSearchParams(s);

      // remove every trace of these params
      usp.delete("start_rank");
      usp.delete("profile");
      usp.delete("collection");

      return usp.toString(); // already de-duped, no leading ?
    } catch (e) {
      // very old browsers fallback - brute-force remove all start_rank/profile/collection
      var s2 = normaliseQs(qs)
        .replace(/(?:^|&)(start_rank|profile|collection)=[^&]*/g, "")
        .replace(/^&+|&+$/g, "")
        .replace(/&{2,}/g, "&");
      return s2;
    }
  }

  function pageSize(sum) {
    var start = sum.currStart || 1;
    var end = sum.currEnd || (start - 1);
    var n = (end >= start) ? (end - start + 1) : 10;
    return n > 0 ? n : 10;
  }

  function pageForStart(start, size) {
    return Math.floor((Math.max(1, start) - 1) / size) + 1;
  }

  function hrefForStart(qs, start) {
    var base = cleanedQuery(qs);
    var usp = new URLSearchParams(base);
    usp.set("start_rank", String(start)); // overwrites if present
    return "?" + usp.toString();
  }

  function render(api, G) {
    var sum = Safe.get(api, "response.resultPacket.resultsSummary", {}) || {};
    var total = sum.totalMatching || 0;
    if (total <= 0) return "";

    var qs = (G && G.server_query_string) ? G.server_query_string : "";
    var size = pageSize(sum);
    var totalPages = Math.ceil(total / size);
    if (totalPages <= 1) return "";

    var currentStart = sum.currStart || 1;
    var currentPage  = pageForStart(currentStart, size);

    // window of up to 5 pages
    var maxButtons = 5;
    var startPage  = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    var endPage    = Math.min(totalPages, startPage + maxButtons - 1);
    startPage      = Math.max(1, endPage - maxButtons + 1);

    var b = Html.buffer();
    b.add('<div class="container">');
    b.add('  <ol class="list-none p-l-0 flex flex-wrap align-center space-center">');

    // prev
    if (currentPage > 1) {
      var prevStart = Math.max(1, currentStart - size);
      b.add('    <li><a class="m-r-050 btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline" href="' +
            Html.esc(hrefForStart(qs, prevStart)) + '">Prev</a></li>');
    }

    // numbered
    for (var p = startPage; p <= endPage; p++) {
      var startRank = (p - 1) * size + 1;
      var isActive = (p === currentPage);
      var cls = 'd-none-sm m-r-0125 btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline' +
                (isActive ? ' active' : '');
      var aria = isActive ? ' aria-current="page"' : '';
      b.add('    <li><a class="' + cls + '" href="' +
            Html.esc(hrefForStart(qs, startRank)) + '"' + aria + '>' + p + '</a></li>');
    }

    // next
    if (currentPage < totalPages) {
      var nextStart = currentStart + size;
      b.add('    <li><a class="btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline" href="' +
            Html.esc(hrefForStart(qs, nextStart)) + '">Next</a></li>');
    }

    b.add('  </ol>');
    b.add('</div>');
    return b.toString();
  }

  return { render: render };
})();
