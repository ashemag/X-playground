const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");

// Structure observed on the October 2026 X desktop UI: no data-testid or time.
function post(handle, id, text, quote = "") {
  return `<li><div role="link"><article id="post-${id}">
    <header><a href="/${handle}"><img alt="@${handle}"></a>
      <a href="/${handle}">${handle}</a><a href="/${handle}">@${handle}</a>
      <a href="/${handle}/status/${id}">2h</a></header>
    <div dir="auto" class="whitespace-pre-wrap">${text}</div>${quote}
    <a class="x-engagement-button" aria-label="Reply" href="/compose/post?in_reply_to=${id}">
      <span class="x-engagement-pill"><svg><use href="#icon-reply"></use></svg>
        <span class="inline-flex"><span class="x-animated-count-visual">12</span></span></span></a>
    <button class="x-engagement-button" aria-label="Like" aria-pressed="false">
      <span class="x-engagement-pill"><svg><use href="#icon-heart"></use></svg>
        <span><span class="x-animated-count-visual">12345</span></span></span></button>
    <a class="x-engagement-button" aria-label="12345 Views" href="/${handle}/status/${id}/analytics">
      <span class="x-engagement-pill"><svg></svg><span class="x-animated-count-visual">730</span></span></a>
    </article></div></li>`;
}

function load(html, pathname = "/home", { beforeStart } = {}) {
  const dom = new JSDOM(`<title>(21) Home / X</title>${html}`, {
    url: `https://x.com${pathname}`, runScripts: "outside-only",
  });
  const { window } = dom;
  const frames = [];
  window.requestAnimationFrame = callback => frames.push(callback);
  window.chrome = { runtime: { getManifest: () => ({ version: "test" }),
    sendMessage: () => assert.fail("AI must stay paused") } };
  beforeStart?.(window);
  window.eval(fs.readFileSync(path.join(__dirname, "../src/title.js"), "utf8"));
  window.eval(source);
  return { window, document: window.document, frames, close: () => window.close(),
    async flush() {
      await Promise.resolve();
      const next = frames.splice(0);
      next.forEach(callback => callback());
    } };
}

test("new engagement counts hide without hiding icons or numbers in post text", t => {
  const h = load(`<main><a href="/reader/followers"><span>12345</span> Followers</a><span>Reposts</span>
    <ul>${post("reader", "1", "12345 Likes and 27 Views <span>42</span>")}</ul></main>`);
  t.after(h.close);
  for (const count of h.document.querySelectorAll(".x-animated-count-visual")) {
    assert.equal(count.getAttribute("aria-hidden"), "true");
    assert.ok(count.classList.contains("x-count-masker-count"));
  }
  assert.equal(h.document.querySelectorAll(".x-engagement-pill.x-count-masker-count").length, 0);
  assert.equal(h.document.querySelectorAll("svg.x-count-masker-count").length, 0);
  assert.equal(h.document.querySelector('[dir="auto"]').querySelectorAll(".x-count-masker-count").length, 0);
  assert.equal(h.document.querySelector('a[href$="/analytics"]').getAttribute("aria-label"), "Views");
  assert.equal(h.document.querySelector('a[href$="/followers"] span').getAttribute("aria-hidden"), null);
});

test("new navigation hides badge labels and blocks notifications while leaving Chat available", t => {
  const h = load(`<nav aria-label="Primary">
    <a href="/notifications" aria-label="Notifications (21 unread notifications)"><svg><path/></svg><span aria-label="21">21</span></a>
    <a href="/i/chat" aria-label="Chat (3 unread messages)"><span aria-label="3">3</span>Chat</a>
    </nav>`);
  t.after(h.close);
  assert.equal(h.document.title, "Home / X");
  const notifications = h.document.querySelector('a[href="/notifications"]');
  assert.equal(notifications.getAttribute("aria-label"), "Notifications");
  assert.equal(notifications.getAttribute("aria-disabled"), "true");
  assert.ok(notifications.classList.contains("x-count-masker-notifications"));
  assert.equal(notifications.dispatchEvent(new h.window.MouseEvent("click", { bubbles: true, cancelable: true })), false);
  const chat = h.document.querySelector('a[href="/i/chat"]');
  assert.equal(chat.getAttribute("aria-label"), "Chat");
  assert.equal(chat.getAttribute("aria-disabled"), null);
  assert.equal(h.document.querySelectorAll(".x-count-masker-badge[aria-hidden=true]").length, 2);
});

test("own likes are locked; other people's likes and own reply buttons remain available", t => {
  const h = load(`<main><ul>${post("ashebytes", "1", "My post")}${post("reader", "2", "Hi <a href='/ashebytes'>@ashebytes</a>")}</ul></main>`);
  t.after(h.close);
  const own = h.document.querySelector("#post-1");
  const other = h.document.querySelector("#post-2");
  assert.ok(own.classList.contains("x-count-masker-own-post"));
  assert.equal(other.classList.contains("x-count-masker-own-post"), false);
  const click = element => element.dispatchEvent(new h.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(click(own.querySelector("button svg")), false);
  assert.equal(click(other.querySelector("button")), true);
  const reply = own.querySelector('a[href*="in_reply_to"]');
  assert.equal(reply.getAttribute("aria-disabled"), null);
  // Prevent jsdom navigation after verifying the extension allowed the event.
  reply.addEventListener("click", event => event.preventDefault());
  let delivered = false;
  reply.addEventListener("click", () => { delivered = true; });
  click(reply);
  assert.equal(delivered, true);
  const wrapper = own.parentElement;
  wrapper.tabIndex = 0;
  wrapper.focus();
  assert.equal(wrapper.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true })), false);
  assert.equal(wrapper.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "r", bubbles: true, cancelable: true })), true);
});

test("new conversations keep camera replies and quote tweets visible", t => {
  const quote = `<div role="link"><a href="/quoted/status/9">Quoted</a><div dir="auto" class="whitespace-pre-wrap">What camera?</div></div>`;
  const h = load(`<main><ul>${post("ashebytes", "1", "My camera")}${post("reader", "2", "Which camera?")}${post("reader", "3", "Great post")}${post("reader", "4", "A quote", quote)}${post("ashebytes", "5", "My camera reply")}</ul></main>`, "/ashebytes/status/1");
  t.after(h.close);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(h.document.querySelector(`#post-${id}`).classList.contains("x-count-masker-hidden-reply"), false);
  assert.match(h.document.querySelector("#x-count-masker-status").textContent, /Reply review paused/);
});

test("other people's conversations leave camera comments visible", t => {
  const h = load(`<main><ul>${post("reader", "1", "My post")}${post("other", "2", "What camera?")}</ul></main>`, "/reader/status/1");
  t.after(h.close);
  assert.equal(h.document.querySelectorAll(".x-count-masker-hidden-reply").length, 0);
});

test("starts before the body exists so slow-loading X pages are still masked", async t => {
  const h = load("", "/ashebytes/status/1", { beforeStart: window => window.document.body.remove() });
  t.after(h.close);
  const body = h.document.createElement("body");
  body.innerHTML = `<main><ul>${post("ashebytes", "1", "Hi")}</ul></main>`;
  h.document.documentElement.appendChild(body);
  await h.flush();
  assert.equal(h.document.querySelector(".x-animated-count-visual").getAttribute("aria-hidden"), "true");
  assert.ok(h.document.querySelector("#x-count-masker-status"));
});

test("observer handles newly loaded posts and animated count updates", async t => {
  const h = load("<main><ul></ul></main>");
  t.after(h.close);
  h.document.querySelector("ul").innerHTML = post("ashebytes", "1", "A new post");
  await h.flush();
  const visual = h.document.querySelector(".x-animated-count-visual");
  assert.equal(visual.getAttribute("aria-hidden"), "true");
  assert.ok(h.document.querySelector("article").classList.contains("x-count-masker-own-post"));
  visual.innerHTML = "<span>12</span><span>13</span>";
  await h.flush();
  assert.equal(visual.getAttribute("aria-hidden"), "true");
  h.document.querySelector('title').textContent = "(99) Updated / X";
  await h.flush();
  assert.equal(h.document.title, "Updated / X");
});

test("unread title assignments are sanitized before reaching the DOM and scans settle", async t => {
  const h = load("<main></main>");
  t.after(h.close);
  const original = h.document.querySelector('title');
  assert.equal(original.textContent, "Home / X");
  for (let i = 0; i < 5; i++) await h.flush();
  assert.equal(h.frames.length, 0);
  h.document.title = "(22) Profile / X";
  assert.equal(original.textContent, "Profile / X");
  await h.flush();
  assert.equal(h.document.title, "Profile / X");
  for (let i = 0; i < 5; i++) await h.flush();
  assert.equal(h.frames.length, 0);
  let mutations = 0;
  const observer = new h.window.MutationObserver(records => { mutations += records.length; });
  observer.observe(original, { childList: true, subtree: true, characterData: true });
  for (let i = 0; i < 10; i++) h.document.title = "(22) Profile / X";
  await Promise.resolve();
  observer.disconnect();
  assert.equal(mutations, 0, "reapplying X's unread prefix must not trigger its title observer again");
});

test("post detail views in separate divs hide and keep the label and timestamp visible", t => {
  const h = load(`<main><article><a href="/ashebytes">ashe</a>
    <a href="/ashebytes/status/1">11:40 AM</a>
    <div dir="auto" class="whitespace-pre-wrap">12345 Views</div>
    <a href="/ashebytes/status/1/analytics"><div>1,193</div><div>Views</div></a>
    </article></main>`);
  t.after(h.close);
  const views = h.document.querySelector('a[href$="/analytics"]');
  assert.equal(views.firstElementChild.getAttribute("aria-hidden"), "true");
  assert.equal(views.lastElementChild.getAttribute("aria-hidden"), null);
  assert.equal(h.document.querySelector('a[href$="/status/1"]').getAttribute("aria-hidden"), null);
});

test("legacy engagement controls still work", t => {
  const h = load(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/ashebytes">ashe</a></div>
    <a href="/ashebytes/status/1"><time>2h</time></a>
    <div data-testid="tweetText">12345 Likes</div>
    <button data-testid="like" aria-label="12345 Likes"><svg></svg><span>12345</span></button></article>`);
  t.after(h.close);
  assert.equal(h.document.querySelector("button").getAttribute("aria-label"), "Likes");
  assert.equal(h.document.querySelector("button span").getAttribute("aria-hidden"), "true");
  assert.equal(h.document.querySelector("button").getAttribute("aria-disabled"), "true");
  assert.equal(h.document.querySelector('[data-testid="tweetText"]').textContent, "12345 Likes");
});
