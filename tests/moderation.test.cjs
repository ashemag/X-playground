const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const quietConsole = { warn() {}, error() {} };

function contentHarness({ llmEnabled = true } = {}) {
  const timers = new Map();
  let timerId = 0;
  const banner = { classList: { toggle() {} }, remove() {}, textContent: "" };
  const context = vm.createContext({
    console: quietConsole,
    Date,
    URL,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    chrome: { runtime: { id: "test", sendMessage() {} } },
    document: { body: {}, getElementById() { return banner; } },
    location: { pathname: "/ashebytes/status/1" },
  });
  // Keep coverage for the retained review code; paused-mode tests use shipped defaults.
  const source = llmEnabled
    ? read("src/content.js").replace("const LLM_FILTER_ENABLED = false;", "const LLM_FILTER_ENABLED = true;")
    : read("src/content.js");
  // Load the real helpers, stopping before DOM observer registration and startup.
  vm.runInContext(source.slice(0, source.indexOf("  document.documentElement.dataset.xPlaygroundVersion")) + `
    const scheduleScan = () => {};
    globalThis.api = { applyVerdict, handleVerdicts, flushClassifications,
      hashText, verdicts, inflight, classifyQueue, VERDICT_STORAGE_KEY,
      updateReviewStatus, setFilteringActive(value) { filteringActive = value; } };
  })();`, context);
  return { ...context.api, context, timers, banner };
}

function comment(text, extra = {}) {
  const classes = new Set(["x-count-masker-hidden-reply"]);
  return {
    id: "123", kind: "reply", author: "reader", text, ownText: text,
    images: [], mediaPending: false,
    target: { dataset: {}, classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
    } },
    hidden() { return classes.has("x-count-masker-hidden-reply"); },
    ...extra,
  };
}

test("paused AI ignores cached hides and never queues or sends reviews", () => {
  const h = contentHarness({ llmEnabled: false });
  h.context.chrome.runtime.sendMessage = () => assert.fail("AI review must not run");
  for (const c of [comment("You are an idiot"), comment("", { images: ["https://example.com/image"] })]) {
    h.verdicts.set(c.id, { hash: h.hashText(`${c.text}\n${c.images.join("\n")}`), hide: true });
    assert.equal(h.applyVerdict(c), false);
    assert.equal(c.hidden(), false);
  }
  assert.equal(h.classifyQueue.size, 0);
  assert.equal(h.inflight.size, 0);
  h.classifyQueue.set("stale", { id: "stale" });
  h.flushClassifications();
  assert.equal(h.timers.size, 0);
  const camera = comment("What camera do you use?");
  h.applyVerdict(camera);
  assert.equal(camera.hidden(), false);
  h.setFilteringActive(true);
  h.updateReviewStatus(0, 3, 1);
  assert.equal(h.banner.textContent, "Reply review paused");
});

test("paused extension registers no background worker or external API access", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.background, undefined);
  assert.deepEqual(manifest.host_permissions || [], []);
});

const cameraMentions = [
  "What camera do you use?", "What camera?", "What's your camera setup?",
  "Which camera are you using?", "WHAT CAMERA DID YOU USE?!",
  "Love the camera work!", "I use a Sony camera too",
  "People keep asking what camera you use; that must be tiring",
  "Nice webcam!", "Shot on a Nikon", "Your cameras are amazing",
];
const normalComments = [
  "Looking at it through a different lens",
  "Time to shift gear", "That is canon",
  "What editor do you use?", "What phone plan would you recommend?",
  "What is your coding setup?",
  "I disagree, here is why", "Small correction: it launched in 2024",
  "Maybe try a shorter intro", "This is damn good", "Thanks for sharing!",
  "Does ASI means it won't make mistakes at all?",
  "If an agent completes the task but for the wrong reasons, is that a successful run or an observability failure?",
  "how does the capability gap between the monitoring agent and the policy being trained affect the reliability of observability?",
  "ok", "Why?", "Source?", "I don't get it", "Is this AI?",
  "Not sure I agree", "This seems overstated", "The audio is hard to hear",
  "This already exists", "Not for me", "Do you have data for that?",
  "What am I missing?", "I think that number is wrong", "Interesting, if true",
  "That's not how it worked in my experience", "I prefer the old version",
  "This claim needs evidence", "hmm", "😂", "🤔",
  "No entiendo", "I don't think this will work, but I'd like to see the results",
];

test("status distinguishes unloaded replies from replies hidden by the extension", () => {
  const h = contentHarness();
  h.setFilteringActive(true);
  h.updateReviewStatus(0, 0, 0);
  assert.equal(h.banner.textContent, "Filter on · no replies loaded on this page yet");
  h.updateReviewStatus(0, 1, 0);
  assert.equal(h.banner.textContent, "Filter on · no loaded replies hidden");
  h.updateReviewStatus(0, 3, 2);
  assert.equal(h.banner.textContent, "Replies filtered");
  h.updateReviewStatus(1, 3, 0);
  assert.equal(h.banner.textContent, "Reviewing replies…");
});

test("camera mentions remain visible while review is pending", () => {
  for (const text of cameraMentions) {
    const h = contentHarness();
    const c = comment(text);
    assert.equal(h.applyVerdict(c), true, text);
    assert.equal(c.hidden(), false, text);
  }
});

test("ordinary comments and unrelated uses of ambiguous words stay visible during review", () => {
  for (const text of normalComments) {
    const h = contentHarness();
    const c = comment(text);
    assert.equal(h.applyVerdict(c), true, text);
    assert.equal(c.hidden(), false, text);
    assert.equal(h.classifyQueue.size, 1);
  }
});

test("quoted camera mentions remain visible during review", () => {
  const h = contentHarness();
  const quoted = comment("Love this\n[quoted post] What camera do you use?", { ownText: "Love this" });
  h.applyVerdict(quoted);
  assert.equal(quoted.hidden(), false);
  const account = comment("Camera enthusiast", { kind: "account" });
  h.applyVerdict(account);
  assert.equal(account.hidden(), false);
});

test("confirmed rude replies hide; changed content is re-reviewed visibly", () => {
  const h = contentHarness();
  const c = comment("You are an idiot");
  h.verdicts.set(c.id, { hash: h.hashText(c.text + "\n"), hide: true });
  assert.equal(h.applyVerdict(c), false);
  assert.equal(c.hidden(), true);
  c.text = c.ownText = "Thanks for sharing";
  assert.equal(h.applyVerdict(c), true);
  assert.equal(c.hidden(), false);
});

test("missing text and unloaded media remain visible", () => {
  for (const mediaPending of [true, false]) {
    const h = contentHarness();
    const c = comment("", { mediaPending });
    h.applyVerdict(c);
    assert.equal(c.hidden(), false);
  }
});

test("API failures leave comments visible and schedule a retry", () => {
  const h = contentHarness();
  const c = comment("Hello!");
  h.applyVerdict(c);
  const batch = [...h.classifyQueue.values()];
  h.handleVerdicts(batch, { ok: false, error: "Service unavailable" });
  h.applyVerdict(c);
  assert.equal(c.hidden(), false);
  assert.equal(h.inflight.size, 0);
  assert.match(h.banner.textContent, /unreviewed replies stay visible/);
  assert.ok([...h.timers.values()].some(({ delay }) => delay === 15000));
});

test("missing and malformed verdicts stay visible and expire for another review", () => {
  for (const verdicts of [[], [{ id: "123", hash: "test", hide: "false" }]]) {
    const h = contentHarness();
    h.handleVerdicts([{ id: "123", hash: "test" }], { ok: true, verdicts });
    const entry = h.verdicts.get("123");
    assert.equal(entry.hide, false);
    assert.equal(entry.reason, "no-verdict");
    assert.ok(entry.expiresAt > Date.now());
  }
});

test("a stalled extension message times out instead of remaining in flight forever", () => {
  const h = contentHarness();
  const c = comment("Hello!");
  h.applyVerdict(c);
  h.flushClassifications();
  assert.equal(h.inflight.size, 1);
  [...h.timers.values()].find(({ delay }) => delay === 30000).fn();
  assert.equal(h.inflight.size, 0);
  assert.equal(c.hidden(), false);
  assert.match(h.banner.textContent, /Review timed out/);
});

function backgroundHarness(responses = [], live = false, initialStored = {}) {
  const stored = structuredClone(initialStored);
  const requests = [];
  const context = vm.createContext({
    self: {}, console: quietConsole, AbortSignal,
    fetch: live ? fetch : async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { ok: next.status ? false : true, status: next.status,
        text: async () => "Image unavailable",
        json: async () => ({ output_text: JSON.stringify(next) }) };
    },
    chrome: { storage: { local: {
      remove(keys) { for (const key of keys) delete stored[key]; },
      async get() { return structuredClone(stored); },
      async set(values) { Object.assign(stored, values); },
    } }, runtime: { onMessage: { addListener() {} } } },
  });
  context.importScripts = () => {
    if (live) vm.runInContext(read("src/secrets.js"), context);
    else context.self.OPENAI_API_KEY = "test-key";
  };
  vm.runInContext(read("src/background.js") + `
    globalThis.api = { callModel, classifyReplies, VERDICT_STORAGE_KEY };`, context);
  return { ...context.api, stored, requests };
}

const reply = (extra = {}) => ({ id: "123", hash: "h", text: "Hello!", images: [], ...extra });
const modelVerdict = (extra = {}) => ({
  id: "r1", hide: false, category: "keep", certainty: "clear", ...extra,
});

test("model verdicts map back to original IDs and cache valid answers", async () => {
  const h = backgroundHarness([{ verdicts: [modelVerdict(), modelVerdict({ id: "r2", hide: true, category: "rude" })] }]);
  const replies = [reply(), reply({ id: "456", text: "You are pathetic" })];
  const actual = await h.classifyReplies(replies);
  assert.equal(actual[0].id, "123");
  assert.equal(actual[0].hide, false);
  assert.equal(actual[1].id, "456");
  assert.equal(actual[1].hide, true);
  await h.classifyReplies(replies);
  assert.equal(h.requests.length, 1);
});

test("missing or nonboolean model answers stay visible and are not cached", async () => {
  for (const verdicts of [[], [null], [modelVerdict({ hide: "true" })],
    [{ id: "r1", hide: true }], [modelVerdict({ category: "unknown" })],
    [modelVerdict({ certainty: "probably" })]]) {
    const h = backgroundHarness([{ verdicts }]);
    const [actual] = await h.classifyReplies([reply()]);
    assert.equal(actual.hide, false);
    assert.equal(actual.reason, "no-verdict");
    assert.equal(Object.keys(h.stored[h.VERDICT_STORAGE_KEY]).length, 0);
  }
});

test("unavailable image-only replies stay visible without caching a fake verdict", async () => {
  const h = backgroundHarness([{ status: 400 }, { verdicts: [modelVerdict({ hide: true, category: "rude" })] }]);
  const [actual] = await h.classifyReplies([reply({ text: "", images: ["https://pbs.twimg.com/image"] })]);
  assert.equal(actual.hide, false);
  assert.equal(actual.reason, "no-verdict");
  assert.equal(Object.keys(h.stored[h.VERDICT_STORAGE_KEY]).length, 0);
  assert.equal(h.requests[1].input[1].content.length, 1);
});

test("both scripts use a fresh cache version to invalidate the strict policy", () => {
  assert.equal(contentHarness().VERDICT_STORAGE_KEY, "replyVerdicts.v9");
  assert.equal(backgroundHarness().VERDICT_STORAGE_KEY, "replyVerdicts.v9");
});

test("ambiguous or neutral classifications cannot hide replies even with a hide flag", async () => {
  for (const fields of [
    { category: "rude", certainty: "ambiguous" },
    { category: "keep", certainty: "clear" },
    { category: "keep", certainty: "ambiguous" },
  ]) {
    const h = backgroundHarness([{ verdicts: [modelVerdict({ hide: true, ...fields })] }]);
    const [actual] = await h.classifyReplies([reply({ text: "Source?" })]);
    assert.equal(actual.hide, false);
    assert.equal(h.stored[h.VERDICT_STORAGE_KEY]["123"].hide, false);
    const c = comment("Source?");
    const page = contentHarness();
    page.applyVerdict(c);
    page.handleVerdicts([...page.classifyQueue.values()], { ok: true,
      verdicts: [{ ...actual, hash: page.hashText(c.text + "\n") }] });
    page.applyVerdict(c);
    assert.equal(c.hidden(), false);
  }
});

test("old hidden verdicts are discarded and re-reviewed under the neutral-friendly policy", async () => {
  const h = backgroundHarness([{ verdicts: [modelVerdict()] }], false, {
    "replyVerdicts.v8": { "123": { hash: "h", hide: true } },
  });
  const [actual] = await h.classifyReplies([reply({ text: "Source?" })]);
  assert.equal(actual.hide, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.stored["replyVerdicts.v8"], undefined);
});

test("live model keeps ordinary replies and hides rude replies", {
  skip: process.env.RUN_LIVE_MODERATION !== "1",
}, async () => {
  const keep = [...cameraMentions, ...normalComments, "I hate how people are treating you", "Love this 😂", "How do you edit your videos?"];
  const hide = [ "You are an idiot", "Your work is pathetic", "Pretty good for someone with no talent", "Only an idiot would believe you", "Are you really this stupid?", "I will find you and hurt you"];
  const cases = [...keep.map(text => ({ text, hide: false })), ...hide.map(text => ({ text, hide: true }))];
  const h = backgroundHarness([], true);
  // Match the extension's batch size so larger fixtures do not truncate output.
  const actual = [];
  for (let offset = 0; offset < cases.length; offset += 20) {
    actual.push(...await h.callModel(cases.slice(offset, offset + 20)
      .map((c, i) => reply({ id: String(offset + i), text: c.text }))));
  }
  for (const [i, verdict] of actual.entries()) {
    assert.equal(verdict.reason, "model", cases[i].text);
    assert.equal(verdict.hide, cases[i].hide, cases[i].text);
  }
});
