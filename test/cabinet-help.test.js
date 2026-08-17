const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Help = require("../js/lib/cabinet-help.js");

describe("TrinityCabinetHelp", () => {
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
    assert.equal(Help.matchQuery("куда ввести токен брокера")[0].id, "broker");
  });

  it("findById walks nested nodes", () => {
    const node = Help.findById("trial-pay");
    assert.ok(node);
    assert.match(node.steps[0], /демонстрацион/i);
  });

  it("childrenOf returns next options", () => {
    const kids = Help.childrenOf("login");
    assert.ok(kids.some((c) => c.id === "login-mail"));
  });

  it("composeMailto encodes path and query", () => {
    const href = Help.composeMailto({
      to: "hello@trinity.local",
      email: "a@b.c",
      topicTitle: "Вход",
      query: "нет письма",
      path: "login → login-mail",
      body: "всё ещё нет",
    });
    assert.match(href, /^mailto:hello@trinity\.local\?/);
    assert.match(href, /subject=/);
    assert.match(href, /body=/);
    assert.ok(href.includes(encodeURIComponent("нет письма")));
  });
});
