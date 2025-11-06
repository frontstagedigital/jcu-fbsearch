/* === utils/safe.js === */
var Safe = (function () {
  function get(obj, path, def) {
    if (!obj || !path) return def;
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur && typeof cur === "object" && (parts[i] in cur)) cur = cur[parts[i]];
      else return def;
    }
    return cur;
  }
  return { get: get };
})();

/* === utils/html.js === */
var Html = (function () {
  function buffer() {
    var b = [];
    return { add: function (s) { b.push(String(s)); }, toString: function () { return b.join(""); } };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function esca(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  return { buffer: buffer, esc: esc, esca: esca };
})();

/* === utils/url.js === */
var Url = (function () {
  function parseQueryString(qs) {
    var out = { filters: {} };
    if (!qs) return out;
    var parts = String(qs).replace(/^\?/, "").split("&");
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split("=");
      if (kv.length !== 2) continue;
      var k = decodeURIComponent(kv[0]);
      var v = decodeURIComponent(kv[1].replace(/\+/g, " "));
      if (k.indexOf("f.") === 0) out.filters[k] = v;
      else out[k] = v;
    }
    return out;
  }
  return { parseQueryString: parseQueryString };
})();

/* === utils/classes.js === */
var CLASSNAMES = {
  alert: "p-4 rounded-lg border border-red-200 bg-red-50 text-red-900"
};
