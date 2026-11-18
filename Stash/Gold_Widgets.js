// 招商实时金价 — Stash Tile
// Adapted from Egern/Gold_Widgets.js (IBL3ND).
// $argument: {"TITLE":"招商金价","POLICY":""}
// Prices preserve the original API labels; timestamp is fetch time, not quote time.
(function () {
  "use strict";
  var API = "https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center";
  var CACHE_KEY = "lkwang88.stash.gold.v1";
  var MAX_CACHE_AGE = 24 * 60 * 60 * 1000;
  var title = "招商金价";
  var finished = false;
  var watchdog;

  function finish(content) {
    if (finished) return;
    finished = true;
    if (typeof clearTimeout === "function") clearTimeout(watchdog);
    $done({ title: title + " · 元/克", content: content, icon: "banknote", backgroundColor: "#252A34" });
  }

  function numeric(value, positive) {
    if (typeof value !== "string" && typeof value !== "number") return false;
    var text = String(value).trim();
    return /^[+-]?\d+(?:\.\d+)?$/.test(text) && isFinite(Number(text)) && (!positive || Number(text) > 0);
  }

  function validQuote(quote) {
    return quote && numeric(quote.buy, true) && numeric(quote.sell, true) && numeric(quote.change, false);
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function timeText(timestamp) {
    var d = new Date(timestamp);
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function render(quote, cached) {
    var amount = Number(quote.change);
    var change = (amount > 0 ? "+" : "") + amount.toFixed(2);
    // Equal-length Chinese labels and a single full-width separator per row.
    // Tile owns the font/alignment; avoid unsupported style fields or fake fonts.
    var timestamp = cached ? timeText(quote.fetchedAt) : timeText(quote.fetchedAt).slice(6);
    finish("买入　" + Number(quote.buy).toFixed(2) + "\n" +
      "卖出　" + Number(quote.sell).toFixed(2) + "\n" +
      "涨跌　" + change + "\n" +
      (cached ? "⚠ 缓存　" : "更新　") + timestamp);
  }

  function fallback(reason) {
    if (finished) return;
    console.log("[Gold Tile] " + reason);
    try {
      var cached = JSON.parse($persistentStore.read(CACHE_KEY) || "null");
      var age = cached && Date.now() - cached.fetchedAt;
      if (validQuote(cached) && typeof cached.fetchedAt === "number" && isFinite(age) && age >= 0 && age <= MAX_CACHE_AGE) {
        render(cached, true);
        return;
      }
    } catch (_) {}
    finish("⚠ 金价获取失败\n暂无有效缓存，请稍后刷新");
  }

  var options = {};
  try {
    if (typeof $argument !== "undefined" && $argument) options = JSON.parse($argument);
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("invalid argument");
    if (options.TITLE != null && typeof options.TITLE !== "string") throw new Error("invalid title");
    if (options.POLICY != null && typeof options.POLICY !== "string") throw new Error("invalid policy");
    title = (options.TITLE || "招商金价").trim() || "招商金价";
  } catch (_) {
    finish("⚠ 参数格式错误\nargument 需要合法的 JSON 对象");
    return;
  }

  var headers = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"
  };
  var policy = (options.POLICY || "").trim();
  if (policy) headers["X-Stash-Selected-Proxy"] = encodeURIComponent(policy);
  watchdog = setTimeout(function () { fallback("request deadline exceeded"); }, 7000);

  try {
    $httpClient.post({
      url: API,
      headers: headers,
      body: "params=" + encodeURIComponent(JSON.stringify([{ prdType: "H", prdCode: "" }])),
      timeout: 5
    }, function (error, response, body) {
      if (finished) return;
      if (error) { fallback("network request failed"); return; }
      var status = response && Number(response.status || response.statusCode);
      if (!status || status < 200 || status >= 300) { fallback("HTTP request failed"); return; }
      try {
        var data = JSON.parse(body);
        if (!data || data.code !== "SUC0000") throw new Error("API error");
        var gold = data.data && data.data.FQAMBPRCZ1;
        var quote = gold && { buy: gold.zBuyPrc, sell: gold.zSelPrc, change: gold.zDvlCur, fetchedAt: Date.now() };
        if (!validQuote(quote)) throw new Error("invalid quote");
        quote.buy = Number(quote.buy).toFixed(2);
        quote.sell = Number(quote.sell).toFixed(2);
        quote.change = Number(quote.change).toFixed(2);
        try { $persistentStore.write(JSON.stringify(quote), CACHE_KEY); } catch (_) {}
        render(quote, false);
      } catch (_) { fallback("invalid API response"); }
    });
  } catch (_) { fallback("request could not start"); }
})();
