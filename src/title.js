(() => {
  // X writes unread counts through document.title. Sanitize the assignment in
  // the page's world before it reaches the DOM, avoiding observer feedback loops.
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "title");
  if (!descriptor?.get || !descriptor?.set) return;
  Object.defineProperty(document, "title", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() { return descriptor.get.call(this); },
    set(value) {
      const title = String(value).replace(/^\s*\(\s*\d+\+?\s*\)\s*/, "");
      if (descriptor.get.call(this) !== title) descriptor.set.call(this, title);
    }
  });
})();
