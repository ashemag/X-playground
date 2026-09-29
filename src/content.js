(() => {
  const ACTION_TEST_IDS = [
    "reply",
    "retweet",
    "unretweet",
    "like",
    "unlike",
    "bookmark",
    "removeBookmark",
    "view",
    "analytics"
  ];

  const ACTION_LABEL_WORDS = [
    "reply",
    "replies",
    "repost",
    "reposts",
    "quote",
    "quotes",
    "like",
    "likes",
    "bookmark",
    "bookmarks",
    "impression",
    "impressions",
    "view",
    "views"
  ];

  const COUNT_VALUE_PATTERN =
    String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[KMB]?`;
  const COUNT_TEXT_PATTERN = new RegExp(
    String.raw`^\s*${COUNT_VALUE_PATTERN}\s*$`,
    "i"
  );
  const FOLLOWER_TEXT_PATTERN = new RegExp(
    String.raw`\b(${COUNT_VALUE_PATTERN})\s+(Followers?)\b`,
    "i"
  );
  const MASKED_METRIC_LABEL_WORDS =
    String.raw`(?:Reposts?|Retweets?|Quotes?|Likes?|Bookmarks?|Views?|Impressions?)`;
  const MASKED_METRIC_TEXT_PATTERN = new RegExp(
    String.raw`\b(${COUNT_VALUE_PATTERN})\s+(${MASKED_METRIC_LABEL_WORDS})\b`,
    "i"
  );
  const MASKED_METRIC_LABEL_PATTERN = new RegExp(
    String.raw`^\s*${MASKED_METRIC_LABEL_WORDS}\s*$`,
    "i"
  );
  const VIEW_METRIC_LABEL_PATTERN = /\b(Views?|Impressions?)\b/i;
  const ACTION_SELECTOR = ACTION_TEST_IDS
    .map((testId) => `[data-testid="${testId}"]`)
    .join(",");
  const VIEW_ACTION_SELECTOR = '[data-testid="view"], [data-testid="analytics"]';
  const FOLLOWER_LINK_SELECTOR =
    'a[href*="/followers"], a[href*="/verified_followers"]';
  const METRIC_TEXT_SELECTOR =
    'span, div[dir="auto"], [data-testid="app-text-transition-container"]';
  const USER_TEXT_SELECTOR =
    '[data-testid="tweetText"], [data-testid="card.wrapper"]';

  const hasActionLabel = (element) => {
    const label = element.getAttribute("aria-label") || "";
    const normalized = label.toLowerCase();
    return ACTION_LABEL_WORDS.some((word) => normalized.includes(word));
  };

  const isCountText = (text) => COUNT_TEXT_PATTERN.test(text);

  const hasCountText = (element) => {
    for (const candidate of element.querySelectorAll(METRIC_TEXT_SELECTOR)) {
      if (isCountText(candidate.textContent || "")) return true;
    }

    return false;
  };

  const maskVisibleCountNode = (element) => {
    if (element.classList.contains("x-count-masker-count")) return;
    element.classList.add("x-count-masker-count");
    element.setAttribute("aria-hidden", "true");
  };

  const markFollowerCountNode = (element) => {
    if (element.classList.contains("x-count-masker-follower-count")) return;

    element.classList.add("x-count-masker-follower-count");
    element.title = "Double-click to show follower count";
  };

  const sanitizeActionLabel = (element) => {
    const label = element.getAttribute("aria-label");
    if (!label || element.dataset.xCountMaskerLastLabel === label) return;

    element.dataset.xCountMaskerLastLabel = label;

    const sanitized = label
      .replace(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*[KMB]?\s+(Replies|Reply|Reposts|Repost|Retweets|Retweet|Quotes|Quote|Likes|Like|Bookmarks|Bookmark|Impressions|Impression|Views|View)\b/gi, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (sanitized && sanitized !== label) {
      element.setAttribute("aria-label", sanitized);
    }
  };

  const maskActionCounts = (actionElement) => {
    if (!actionElement) return;
    sanitizeActionLabel(actionElement);

    const candidates = actionElement.querySelectorAll(
      METRIC_TEXT_SELECTOR
    );

    for (const candidate of candidates) {
      const text = candidate.textContent || "";
      if (isCountText(text)) {
        maskVisibleCountNode(candidate);
      }
    }
  };

  const maskCountsInContainer = (container) => {
    if (!container || container.closest(USER_TEXT_SELECTOR)) return;

    const candidates = container.querySelectorAll(METRIC_TEXT_SELECTOR);
    for (const candidate of candidates) {
      const text = candidate.textContent || "";
      if (isCountText(text)) {
        maskVisibleCountNode(candidate);
      }
    }
  };

  const maskNearbyViewMetricCount = (element) => {
    let container = element;

    for (let depth = 0; container && depth < 5; depth++) {
      if (hasCountText(container)) {
        maskCountsInContainer(container);
        return;
      }

      container = container.parentElement;
    }
  };

  const findFollowerCountNode = (linkElement) => {
    const candidates = linkElement.querySelectorAll(
      METRIC_TEXT_SELECTOR
    );

    for (const candidate of candidates) {
      const text = candidate.textContent || "";
      if (isCountText(text)) {
        return candidate;
      }
    }

    return null;
  };

  const wrapFollowerCountText = (linkElement) => {
    const walker = document.createTreeWalker(
      linkElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (
            node.parentElement?.closest(".x-count-masker-follower-count")
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          return FOLLOWER_TEXT_PATTERN.test(node.nodeValue || "")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNode = walker.nextNode();
    if (!textNode || !textNode.parentNode) return null;

    const text = textNode.nodeValue || "";
    const match = text.match(FOLLOWER_TEXT_PATTERN);
    if (!match || typeof match.index !== "number") return null;

    const countText = match[1];
    const countStart = match.index + match[0].indexOf(countText);
    const countEnd = countStart + countText.length;
    const countElement = document.createElement("span");
    countElement.textContent = countText;
    markFollowerCountNode(countElement);

    const fragment = document.createDocumentFragment();
    fragment.append(text.slice(0, countStart));
    fragment.append(countElement);
    fragment.append(text.slice(countEnd));

    textNode.parentNode.replaceChild(fragment, textNode);
    return countElement;
  };

  const maskFollowerCount = (linkElement) => {
    const countNode = findFollowerCountNode(linkElement) ||
      wrapFollowerCountText(linkElement);
    if (!countNode) return;

    markFollowerCountNode(countNode);
  };

  const wrapMetricCountText = (root, pattern) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (
            node.parentElement?.closest(
              ".x-count-masker-count, .x-count-masker-follower-count"
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          if (node.parentElement?.closest(USER_TEXT_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }

          return pattern.test(node.nodeValue || "")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
      if (!textNode.parentNode) continue;

      const text = textNode.nodeValue || "";
      const match = text.match(pattern);
      if (!match || typeof match.index !== "number") continue;

      const countText = match[1];
      const countStart = match.index + match[0].indexOf(countText);
      const countEnd = countStart + countText.length;
      const countElement = document.createElement("span");
      countElement.textContent = countText;
      maskVisibleCountNode(countElement);

      const fragment = document.createDocumentFragment();
      fragment.append(text.slice(0, countStart));
      fragment.append(countElement);
      fragment.append(text.slice(countEnd));

      textNode.parentNode.replaceChild(fragment, textNode);
    }
  };

  const maskCountPairedWithLabel = (labelElement) => {
    let container = labelElement.parentElement;

    for (let depth = 0; container && depth < 8; depth++) {
      if (container.closest(USER_TEXT_SELECTOR)) return;

      const candidates = Array.from(
        container.querySelectorAll(METRIC_TEXT_SELECTOR)
      );
      const labelIndex = candidates.indexOf(labelElement);

      if (labelIndex !== -1) {
        const precedingCount = candidates
          .slice(0, labelIndex)
          .reverse()
          .find((candidate) => isCountText(candidate.textContent || ""));
        const followingCount = candidates
          .slice(labelIndex + 1)
          .find((candidate) => isCountText(candidate.textContent || ""));
        const countElement = precedingCount || followingCount;

        if (countElement) {
          maskVisibleCountNode(countElement);
          return;
        }
      }

      container = container.parentElement;
    }
  };

  const maskLabelledMetricCounts = (root) => {
    for (const labelElement of root.querySelectorAll(METRIC_TEXT_SELECTOR)) {
      if (!MASKED_METRIC_LABEL_PATTERN.test(labelElement.textContent || "")) {
        continue;
      }

      maskCountPairedWithLabel(labelElement);
    }
  };

  const maskViewMetricCounts = (root) => {
    for (const viewAction of root.querySelectorAll(VIEW_ACTION_SELECTOR)) {
      maskActionCounts(viewAction);
      maskNearbyViewMetricCount(viewAction);
    }

    for (const labelledElement of root.querySelectorAll("[aria-label]")) {
      const label = labelledElement.getAttribute("aria-label") || "";
      if (!VIEW_METRIC_LABEL_PATTERN.test(label)) continue;

      sanitizeActionLabel(labelledElement);
      maskActionCounts(labelledElement);
      maskNearbyViewMetricCount(labelledElement);
    }
  };

  const NAV_TAB_SELECTOR = '[data-testid^="AppTabBar_"]';
  const TITLE_COUNT_PATTERN = /^\s*\(\s*\d+\+?\s*\)\s*/;
  const NAV_LABEL_COUNT_PATTERN =
    /\s*\(?\s*\d+\+?\s+(?:new|unread)\s+[^)]*\)?|\s*\(\s*\d+\+?\s*\)/gi;
  const FAVICON_PIP_PATTERN = /twitter-pip(\.\d+)?\.ico/;

  const maskNavBadges = (root) => {
    for (const tab of root.querySelectorAll(NAV_TAB_SELECTOR)) {
      for (const badge of tab.querySelectorAll("[aria-live]")) {
        badge.classList.add("x-count-masker-badge");
        badge.setAttribute("aria-hidden", "true");
      }

      const label = tab.getAttribute("aria-label");
      if (!label) continue;

      const sanitized = label.replace(NAV_LABEL_COUNT_PATTERN, "").trim();
      if (sanitized && sanitized !== label) {
        tab.setAttribute("aria-label", sanitized);
      }
    }
  };

  const maskTitleCount = () => {
    const title = document.title;
    if (TITLE_COUNT_PATTERN.test(title)) {
      document.title = title.replace(TITLE_COUNT_PATTERN, "");
    }
  };

  const maskFaviconBadge = () => {
    for (const icon of document.querySelectorAll('link[rel~="icon"]')) {
      const href = icon.getAttribute("href") || "";
      if (FAVICON_PIP_PATTERN.test(href)) {
        icon.setAttribute(
          "href",
          href.replace(FAVICON_PIP_PATTERN, "twitter$1.ico")
        );
      }
    }
  };

  const NOTIFICATIONS_LINK_SELECTOR =
    '[data-testid="AppTabBar_Notifications_Link"], a[href="/notifications"], a[href^="/notifications/"]';
  const NOTIFICATIONS_PATH_PATTERN = /^\/notifications(?:\/|$)/;

  const blockNotificationsPage = () => {
    if (NOTIFICATIONS_PATH_PATTERN.test(location.pathname)) {
      location.replace("/home");
    }
  };

  const blockNotificationsLinks = (root) => {
    for (const link of root.querySelectorAll(NOTIFICATIONS_LINK_SELECTOR)) {
      link.setAttribute("tabindex", "-1");
      link.setAttribute("aria-disabled", "true");
    }
  };

  const OWN_HANDLE = "ashebytes";
  const OWN_POST_CLASS = "x-count-masker-own-post";
  const LOCKED_ACTION_TEST_IDS = [
    "reply",
    "like",
    "unlike"
  ];
  const LOCKED_ACTION_SELECTOR = LOCKED_ACTION_TEST_IDS
    .map((testId) => `.${OWN_POST_CLASS} [data-testid="${testId}"]`)
    .join(",");
  const LOCKED_SHORTCUT_KEYS = new Set(["l", "r"]);

  const isOwnPost = (article) => {
    const authorName = article.querySelector('[data-testid="User-Name"]');
    if (!authorName) return false;

    for (const link of authorName.querySelectorAll("a[href]")) {
      const handle = (link.getAttribute("href") || "").replace(/^\//, "");
      if (handle.toLowerCase() === OWN_HANDLE) return true;
    }

    return false;
  };

  const lockOwnPosts = (root) => {
    for (const article of root.querySelectorAll('article[data-testid="tweet"]')) {
      if (!isOwnPost(article)) {
        article.classList.remove(OWN_POST_CLASS);
        continue;
      }

      article.classList.add(OWN_POST_CLASS);
    }

    for (const action of root.querySelectorAll(LOCKED_ACTION_SELECTOR)) {
      action.setAttribute("tabindex", "-1");
      action.setAttribute("aria-disabled", "true");
      sanitizeActionLabel(action);
      maskActionCounts(action);
    }
  };

  const HIDDEN_REPLY_CLASS = "x-count-masker-hidden-reply";
  const OWN_STATUS_PATH_PATTERN = new RegExp(
    String.raw`^/${OWN_HANDLE}/status/(\d+)(/photo/\d+|/video/\d+)?/?$`,
    "i"
  );

  const containsStatusLink = (article, statusId) => {
    const statusLinkPattern = new RegExp(`/status/${statusId}$`);

    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      if (statusLinkPattern.test(link.getAttribute("href") || "")) return true;
    }

    return false;
  };

  const hideRepliesOnOwnPostPage = () => {
    const match = location.pathname.match(OWN_STATUS_PATH_PATTERN);
    const hiddenCells = new Set();

    if (match) {
      const statusId = match[1];
      const isMediaView = Boolean(match[2]);
      const scope = isMediaView
        ? document.querySelector('[role="dialog"]')
        : document.querySelector('[data-testid="primaryColumn"]');
      const cells = scope
        ? Array.from(scope.querySelectorAll('[data-testid="cellInnerDiv"]'))
        : [];
      const focalIndex = isMediaView
        ? -1
        : cells.findIndex((cell) => {
          const article = cell.querySelector('article[data-testid="tweet"]');
          return article && containsStatusLink(article, statusId);
        });

      cells.forEach((cell, index) => {
        if (index <= focalIndex) return;

        const article = cell.querySelector('article[data-testid="tweet"]');
        if (article?.classList.contains(OWN_POST_CLASS)) return;

        hiddenCells.add(cell);
      });
    }

    for (const cell of document.querySelectorAll(`.${HIDDEN_REPLY_CLASS}`)) {
      if (!hiddenCells.has(cell)) cell.classList.remove(HIDDEN_REPLY_CLASS);
    }

    for (const cell of hiddenCells) {
      cell.classList.add(HIDDEN_REPLY_CLASS);
    }
  };

  const scan = (root = document) => {
    blockNotificationsPage();
    blockNotificationsLinks(root);
    maskNavBadges(root);
    maskTitleCount();
    maskFaviconBadge();

    for (const actionElement of root.querySelectorAll(ACTION_SELECTOR)) {
      maskActionCounts(actionElement);
    }

    for (const followerLink of root.querySelectorAll(FOLLOWER_LINK_SELECTOR)) {
      maskFollowerCount(followerLink);
    }

    const scanRoot = root.body || root;
    wrapMetricCountText(scanRoot, MASKED_METRIC_TEXT_PATTERN);
    maskLabelledMetricCounts(scanRoot);
    maskViewMetricCounts(scanRoot);
    lockOwnPosts(scanRoot);
    hideRepliesOnOwnPostPage();

    for (const element of root.querySelectorAll("[aria-label]")) {
      if (hasActionLabel(element)) {
        sanitizeActionLabel(element);
      }
    }
  };

  let scheduled = false;

  const scheduleScan = () => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  };

  scan();

  document.addEventListener(
    "click",
    (event) => {
      if (!event.target.closest(".x-count-masker-follower-count")) return;

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  for (const eventName of ["click", "auxclick", "mousedown", "keydown"]) {
    document.addEventListener(
      eventName,
      (event) => {
        if (!event.target.closest?.(NOTIFICATIONS_LINK_SELECTOR)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  for (const eventName of ["click", "auxclick", "mousedown", "keydown"]) {
    document.addEventListener(
      eventName,
      (event) => {
        if (!event.target.closest?.(LOCKED_ACTION_SELECTOR)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!LOCKED_SHORTCUT_KEYS.has(event.key.toLowerCase())) return;

      const active = document.activeElement;
      if (!active || active.isContentEditable) return;
      if (active.matches("input, textarea, select")) return;
      if (!active.closest(`.${OWN_POST_CLASS}`)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  const OWN_POST_ALLOWED_TARGET_SELECTOR = [
    "button",
    '[role="button"]',
    '[role="link"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="card.wrapper"]'
  ].join(",");
  const OWN_POST_BLOCKED_TARGET_SELECTOR =
    '[data-testid="tweet-text-show-more-link"]';
  const STATUS_LINK_PATTERN = /\/status\/\d+/;

  const opensOwnPost = (target, article) => {
    if (target.closest(OWN_POST_BLOCKED_TARGET_SELECTOR)) return true;

    const quotedPost = target.closest('[role="link"]');
    if (quotedPost && article.contains(quotedPost)) return false;

    const link = target.closest("a[href]");
    if (link && article.contains(link)) {
      return STATUS_LINK_PATTERN.test(link.getAttribute("href") || "");
    }

    const allowed = target.closest(OWN_POST_ALLOWED_TARGET_SELECTOR);
    return !allowed || !article.contains(allowed);
  };

  for (const eventName of ["click", "auxclick"]) {
    document.addEventListener(
      eventName,
      (event) => {
        const article = event.target.closest?.(`.${OWN_POST_CLASS}`);
        if (!article || !opensOwnPost(event.target, article)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key.toLowerCase() !== "o") return;
      if (!document.activeElement?.matches?.(`.${OWN_POST_CLASS}`)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  window.addEventListener("popstate", blockNotificationsPage);

  document.addEventListener(
    "dblclick",
    (event) => {
      const countNode = event.target.closest(".x-count-masker-follower-count");
      if (!countNode) return;

      countNode.classList.toggle("x-count-masker-follower-count--revealed");
      countNode.title = countNode.classList.contains(
        "x-count-masker-follower-count--revealed"
      )
        ? "Double-click to hide follower count"
        : "Double-click to show follower count";

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "aria-label"]
  });
})();
