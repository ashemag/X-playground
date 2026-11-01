const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadContentScript() {
  const listeners = new Map();
  const document = {
    title: "X",
    documentElement: { dataset: {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener(type, callback, capture) {
      const entries = listeners.get(type) || [];
      entries.push({ callback, capture });
      listeners.set(type, entries);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8"),
    {
      document, URL,
      window: { addEventListener() {} },
      location: { pathname: "/home" },
      chrome: { runtime: { getManifest: () => ({ version: "test" }) } },
      NodeFilter: { SHOW_TEXT: 4 },
      MutationObserver: class { observe() {} },
      requestAnimationFrame() {},
      setTimeout, clearTimeout, console,
    }
  );
  return listeners;
}

test("follower hover and focus are intercepted before X can open a tooltip", () => {
  const listeners = loadContentScript();
  for (const type of ["mouseover", "mouseenter", "pointerover", "pointerenter", "focus", "focusin"]) {
    let stopped = false;
    const event = {
      target: {
        closest(selector) {
          assert.match(selector, /\/followers/);
          assert.match(selector, /\/verified_followers/);
          return { getAttribute: () => "/ashebytes/verified_followers" };
        },
      },
      stopImmediatePropagation() { stopped = true; },
    };
    for (const { callback, capture } of listeners.get(type) || []) {
      assert.equal(capture, true, "must intercept before X's bubble handlers");
      callback(event);
    }
    assert.equal(stopped, true, `${type} must not reach X's tooltip handler`);
  }
});

test("other people’s follower tooltips and unrelated hover/focus remain available", () => {
  const listeners = loadContentScript();
  for (const type of ["mouseover", "mouseenter", "pointerover", "pointerenter", "focus", "focusin"]) {
    for (const { callback } of listeners.get(type) || []) {
      for (const href of [null, "/someoneelse/followers", "/someoneelse/verified_followers", "/ashebytes2/followers", "/ashebytes/following"]) {
        callback({
          target: { closest: () => href ? { getAttribute: () => href } : null },
          stopImmediatePropagation() { assert.fail(`${type} on ${href} was blocked`); },
        });
      }
    }
  }
});

test("only your count is masked, including when X reuses a profile element", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
  const context = vm.createContext({ URL, location: { pathname: "/home" } });
  vm.runInContext(source.slice(0, source.indexOf("  document.documentElement.dataset.xPlaygroundVersion")) +
    "globalThis.maskFollowerCount = maskFollowerCount; })();", context);
  function element(attributes = {}) {
    const classes = new Set();
    return {
      attributes,
      textContent: "123",
      classList: {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value),
        toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
      },
      getAttribute: key => attributes[key] ?? null,
      setAttribute: (key, value) => { attributes[key] = value; },
      removeAttribute: key => { delete attributes[key]; },
    };
  }
  const count = element({ title: "123" });
  const link = element({ href: "/someoneelse/followers", title: "123" });
  link.querySelectorAll = selector => selector.startsWith(".")
    ? (count.classList.contains(selector.slice(1)) ? [count] : []) : [count];
  context.maskFollowerCount(link);
  assert.equal(count.classList.contains("x-count-masker-follower-count"), false);
  assert.equal(link.getAttribute("title"), "123");
  assert.equal(count.getAttribute("title"), "123");
  for (const href of ["/ashebytes/followers", "https://twitter.com/AsheBytes/verified_followers?test=1"]) {
    link.attributes.href = href;
    context.maskFollowerCount(link);
    assert.equal(count.classList.contains("x-count-masker-follower-count"), true);
    assert.equal(link.classList.contains("x-count-masker-own-followers"), true);
    assert.equal(count.getAttribute("aria-hidden"), "true");
  }
  link.attributes.href = "/someoneelse/verified_followers";
  context.maskFollowerCount(link);
  assert.equal(count.classList.contains("x-count-masker-follower-count"), false);
  assert.equal(link.classList.contains("x-count-masker-own-followers"), false);
  assert.equal(count.getAttribute("aria-hidden"), null);
});
