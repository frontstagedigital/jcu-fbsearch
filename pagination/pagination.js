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
    b.add('  <ol class="list-none p-l-0 flex flex-wrap align-center space-center">');

    // Prev
    if (currentPage > 1) {
      var prevStart = Math.max(1, currentStart - size);
      b.add('    <li>');
      b.add('      <a class="m-r-050 btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline external-disabled" href="' + Html.esc(hrefForStart(qs, prevStart)) + '">Prev</a>');
      b.add('    </li>');
    }

    // Numbered pages
    for (var p = startPage; p <= endPage; p++) {
      var startRank = (p - 1) * size + 1;
      var isActive = (p === currentPage);
      var cls = 'd-none-sm m-r-0125 btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline external-disabled' + (isActive ? ' active' : '');
      var aria = isActive ? ' aria-current="page"' : '';
      b.add('    <li>');
      b.add('      <a class="' + cls + '" href="' + Html.esc(hrefForStart(qs, startRank)) + '"' + aria + '>' + p + '</a>');
      b.add('    </li>');
    }

    // Next
    if (currentPage < totalPages) {
      var nextStart = currentStart + size;
      b.add('    <li>');
      b.add('      <a class="btn secondary-one border-none p-t-050 p-b-050 p-l-100 p-r-100 m-b-150 f-overline external-disabled" href="' + Html.esc(hrefForStart(qs, nextStart)) + '">Next</a>');
      b.add('    </li>');
    }

    b.add('  </ol>');
    b.add('</div>');
    return b.toString();
  }

  return { render: render };
})();
