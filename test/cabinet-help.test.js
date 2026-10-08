const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Help = require("../js/lib/cabinet-help.js");

describe("TrinityCabinetHelp", () => {
  it("day-part greeting follows local hour bands", () => {
    assert.equal(Help.dayPartGreeting(9), "Доброе утро");
    assert.equal(Help.dayPartGreeting(11), "Доброе утро");
    assert.equal(Help.dayPartGreeting(12), "Добрый день");
    assert.equal(Help.dayPartGreeting(17), "Добрый день");
    assert.equal(Help.dayPartGreeting(18), "Добрый вечер");
    assert.equal(Help.dayPartGreeting(20), "Добрый вечер");
    assert.equal(Help.dayPartGreeting(21), "Доброй ночи");
    assert.equal(Help.dayPartGreeting(3), "Доброй ночи");
  });

  it("buildGreeting names Маша and optional user", () => {
    const morning = Help.buildGreeting({ hour: 9, name: "Иван Петров" });
    assert.match(morning, /^Доброе утро, Иван\./);
    assert.match(morning, /Я Маша/);
    const night = Help.buildGreeting({ hour: 22, email: "anna.k@example.com" });
    assert.match(night, /^Доброй ночи, Anna\./);
    const anon = Help.buildGreeting({ hour: 14 });
    assert.match(anon, /^Добрый день\./);
    assert.doesNotMatch(anon, /,\s*\./);
  });

  it("resolveDisplayName prefers profile over email", () => {
    assert.equal(
      Help.resolveDisplayName({ displayName: "Мария С.", email: "x@y.z" }),
      "Мария"
    );
    assert.equal(Help.resolveDisplayName({ email: "ivan@trinity.trading" }), "Ivan");
    assert.equal(Help.resolveDisplayName({ email: "42@x.ru" }), "");
  });

  it("empty query returns top-level topics", () => {
    const cards = Help.matchQuery("");
    assert.ok(cards.length >= 5);
    assert.equal(cards[0].id, "login");
    assert.equal(cards[0].hasChildren, true);
  });

  it("matches confirmation email to login-mail", () => {
    const cards = Help.matchQuery("не приходит письмо подтверждения");
    assert.equal(cards[0].id, "login-mail");
  });

  it("matches /view and localhost to instance branch", () => {
    const ids = Help.matchQuery("localhost 8080 не открывается").map((c) => c.id);
    assert.ok(ids.includes("instance-local") || ids.includes("instance"));
  });

  it("matches broker token away from cabinet", () => {
    const id = Help.matchQuery("куда ввести токен брокера")[0].id;
    assert.ok(id === "broker" || id === "broker-where");
  });

  it("matches live-data question to metrics", () => {
    const id = Help.matchQuery("живые данные из приложения")[0].id;
    assert.ok(id === "metrics" || id === "metrics-empty" || id === "metrics-read");
  });

  it("desk screen questions open desk branch", () => {
    const hit = Help.matchQuery("что значит режим SIDEWAYS на столе")[0];
    assert.ok(hit);
    assert.ok(hit.id === "desk" || hit.id === "desk-regime");
  });

  it("wiki fallback for cointegration / footprint wording", () => {
    const wiki = Help.matchWiki("что такое коинтеграция двух акций");
    assert.ok(wiki.length);
    assert.equal(wiki[0].id, "wiki-pairs");
    assert.match(wiki[0].blurb, /Z/i);
    assert.equal(wiki[0].href, "wiki/pairs-moex.html");

    const foot = Help.resolveHelp("почему в футпринте imbalance на ask");
    assert.equal(foot.mode, "wiki");
    assert.equal(foot.wiki.id, "wiki-volume");
    assert.match(foot.wiki.blurb, /стакан/i);
  });

  it("resolveHelp menu on empty query", () => {
    const r = Help.resolveHelp("");
    assert.equal(r.mode, "menu");
    assert.ok(r.topics.length >= 7);
  });

  it("findById walks nested nodes", () => {
    const node = Help.findById("trial-pay");
    assert.ok(node);
    assert.match(node.steps[0], /не подключена/i);
  });

  it("childrenOf returns next options", () => {
    const kids = Help.childrenOf("login");
    assert.ok(kids.some((c) => c.id === "login-mail"));
  });

  it("composeMailto encodes path and query", () => {
    const href = Help.composeMailto({
      to: "info@trinity.trading",
      email: "a@b.c",
      topicTitle: "Вход",
      query: "нет письма",
      path: "login → login-mail",
      body: "всё ещё нет",
    });
    assert.match(href, /^mailto:info@trinity\.trading\?/);
    assert.match(href, /subject=/);
    assert.match(href, /body=/);
    assert.ok(href.includes(encodeURIComponent("нет письма")));
  });

  it("sanitizeHelpText redacts email and tokens", () => {
    const s = Help.sanitizeHelpText(
      "пиши на user@trinity.trading и токен t.abcdefghijklmnopqrstuvwxyz012345"
    );
    assert.match(s, /\[email\]/);
    assert.match(s, /\[token\]/);
    assert.doesNotMatch(s, /user@trinity/);
  });

  it("sanitizeHelpText redacts passwords and JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n00nul0";
    const s = Help.sanitizeHelpText("пароль: Secret123! jwt " + jwt);
    assert.match(s, /пароль=\[redacted\]/i);
    assert.match(s, /\[jwt\]/);
    assert.doesNotMatch(s, /Secret123/);
    assert.doesNotMatch(s, /eyJhbGci/);
  });

  it("buildHelpLog packs turn for training", () => {
    const row = Help.buildHelpLog({
      sessionId: "mabc",
      eventType: "turn",
      userText: "что такое коинтеграция",
      replyMode: "wiki",
      replySummary: "wiki: Пары · Z",
      topicIds: ["wiki-pairs"],
      wikiId: "wiki-pairs",
      wikiHref: "wiki/pairs-moex.html",
    });
    assert.equal(row.session_id, "mabc");
    assert.equal(row.event_type, "turn");
    assert.equal(row.user_text, "что такое коинтеграция");
    assert.equal(row.wiki_id, "wiki-pairs");
    assert.deepEqual(row.topic_ids, ["wiki-pairs"]);
  });
});
