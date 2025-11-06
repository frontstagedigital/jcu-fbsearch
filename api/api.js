/* === api/fb.js === */
var FB = (function () {
  function init(rest) {
    var body = rest && rest.response && rest.response.body;
    if (!body) return null;
    if (typeof body === "string") { try { return JSON.parse(body); } catch (e) { return null; } }
    return body;
  }
  function valid(api) {
    return !!(api && api.response && api.response.resultPacket);
  }
  function totals(api) {
    return Safe.get(api, "response.resultPacket.resultsSummary.totalMatching", 0) || 0;
  }
  function spell(api) {
    return Safe.get(api, "response.resultPacket.spell.text", null);
  }
  return { init: init, valid: valid, totals: totals, spell: spell };
})();
