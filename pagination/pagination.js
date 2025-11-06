var Pager = (function () {
  function cleanedQuery(qs) {
    try {
      var s = Url.removeParam(qs, "start_rank");
      s = Url.removeParam(s, "profile");
      s = Url.removeParam(s, "collection");
      return s;
    } catch (e) { return qs || ""; }
  }

  function pageSize(sum) {
    var start = sum.currStart || 1;
    var end = sum.currEnd || (start - 1);
    var n = (end >= start) ? (end - start + 1) : 10; // default 10
    return n > 0 ? n : 10;
  }

  function pageForStart(start, size) {
    return Math.floor((Math.max(1, start) - 1) / size) + 1;
  }

  function hrefForStart(qs, start) {
    var c = cleanedQuery(qs);
    return "?" + (c ? c + "&" : "") + "start_rank=" + String(start);
  }

  function render(api, G) {
    var sum = Safe.get(api, "response.resultPacket.resultsSummary", {}) || {};
    var total = sum.totalMatching || 0;
    if (total <= 0) return "";

    var qs = (G && G.server_query_string) ? G.server_query_string : "";
    var size = pageSize(sum);
    var totalPages = Math.ceil(total / size);
    if (totalPages <= 1) return ""; // nothing to paginate

    var currentStart = sum.currStart || 1;
    var currentPage = pageForStart(currentStart, size);

    // window of 5 page numbers around the current page
    var maxButtons = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    var endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);

    var b = Html.buffer();
    b.add('<div class="container">');
    b.add('  <div class="flex align-center space-center">');

    // Prev
    if (currentPage > 1) {
      var prevStart = Math.max(1, currentStart - size);
      b.add('    <a class="external-disabled" href="' + Html.esc(hrefForStart(qs, prevStart)) + '">');
      b.add('      <button class="m-r-050 special-three border-none round-xs p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline">Prev</button>');
      b.add('    </a>');
    }

    // Numbered pages
    for (var p = startPage; p <= endPage; p++) {
      var startRank = (p - 1) * size + 1;
      b.add('    <a class="external-disabled" href="' + Html.esc(hrefForStart(qs, startRank)) + '">');
      b.add('      <button class="m-r-0125 special-three border-none round-xs p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline">' + p + '</button>');
      b.add('    </a>');
    }

    // Next
    if (currentPage < totalPages) {
      var nextStart = currentStart + size;
      b.add('    <a class="external-disabled" href="' + Html.esc(hrefForStart(qs, nextStart)) + '">');
      b.add('      <button class="special-three border-none round-xs p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline">Next</button>');
      b.add('    </a>');
    }

    b.add('  </div>');
    b.add('</div>');
    return b.toString();
  }

  return { render: render };
})();
