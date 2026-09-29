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
    String.raw`^/${OWN_HANDLE}/status/(\d+)(/photo/\d+|/video/\d+)?(/retweets(?:/with_comments)?|/quotes|/likes)?/?$`,
    "i"
  );
  const GEAR_QUESTION_PATTERN = new RegExp(
    [
      String.raw`\b(?:camera|cam|cams|lens|lenses|dslr|mirrorless|gear|rig)\b`,
      String.raw`\b(?:shot|shoot|shooting|film|filmed|filming|record|recorded|recording)\s+(?:this\s+|that\s+|it\s+)?(?:on|with)\b`,
      String.raw`\bwhat\s+(?:phone|device)\b`,
      String.raw`\b(?:canon|nikon|sony\s+a\d|fuji|fujifilm|leica|gopro|insta360|lumix|blackmagic|red\s+komodo)\b`
    ].join("|"),
    "i"
  );

  const containsStatusLink = (article, statusId) => {
    const statusLinkPattern = new RegExp(`/status/${statusId}$`);

    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      if (statusLinkPattern.test(link.getAttribute("href") || "")) return true;
    }

    return false;
  };

  const VERDICT_STORAGE_KEY = "replyVerdicts.v3";
  const COMMENT_SCOPES = '[data-testid="primaryColumn"], [role="dialog"]';
  const verdicts = new Map();
  const inflight = new Set();
  const classifyQueue = new Map();
  let cacheReady = false;
  let flushTimer = 0;
  let retryAfter = 0;

  const hashText = (text) => {
    let hash = 5381;
    for (let index = 0; index < text.length; index++) {
      hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  };

  const handleFromHref = (href) => {
    if (!href) return "";
    const path = href.replace(/^https?:\/\/(?:x|twitter)\.com/i, "");
    const handle = path.replace(/^\//, "").split(/[/?#]/)[0];
    if (!handle || handle === "i" || handle === "home" || handle === "search") {
      return "";
    }
    return handle.toLowerCase();
  };

  const tweetIdFromArticle = (article) => {
    const timeLink = article.querySelector('a[href*="/status/"] time')?.closest("a");
    const href = timeLink?.getAttribute("href") || "";
    const match = href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  };

  const MAX_IMAGES_PER_REPLY = 4;

  const cleanText = (text) => (text || "").replace(/\s+/g, " ").trim();

  const textWithEmoji = (node) => {
    let text = "";
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    );
    let current = walker.nextNode();

    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        text += current.nodeValue;
      } else if (current.tagName === "IMG") {
        text += current.getAttribute("alt") || "";
      } else if (current.tagName === "BR") {
        text += "\n";
      }
      current = walker.nextNode();
    }

    return text;
  };

  const isInQuotedPost = (element, article) => {
    const quoted = element.closest('[role="link"]');
    return Boolean(quoted && article.contains(quoted) && quoted !== article);
  };

  const tweetTexts = (article) => {
    const own = [];
    const quoted = [];

    for (const node of article.querySelectorAll('[data-testid="tweetText"]')) {
      const text = cleanText(textWithEmoji(node));
      if (!text) continue;
      (isInQuotedPost(node, article) ? quoted : own).push(text);
    }

    return { own, quoted };
  };

  const tweetBody = (article) => {
    const { own, quoted } = tweetTexts(article);

    const alts = Array.from(
      article.querySelectorAll('[data-testid="tweetPhoto"] img[alt]')
    )
      .map((img) => cleanText(img.getAttribute("alt")))
      .filter((alt) => alt && alt !== "Image");

    const parts = [...own];
    if (alts.length) parts.push(`[image description] ${alts.join(" | ")}`);
    if (quoted.length) parts.push(`[quoted post] ${quoted.join(" | ")}`);

    return parts.join("\n").slice(0, 1500);
  };

  const imageUrl = (src) => {
    if (!src || !/^https:\/\/pbs\.twimg\.com\//.test(src)) return "";
    try {
      const url = new URL(src);
      if (url.searchParams.has("name")) url.searchParams.set("name", "small");
      return url.toString();
    } catch {
      return "";
    }
  };

  const tweetImages = (article) => {
    const urls = [];
    const push = (src) => {
      const url = imageUrl(src);
      if (url && !urls.includes(url)) urls.push(url);
    };

    for (const img of article.querySelectorAll('[data-testid="tweetPhoto"] img')) {
      push(img.getAttribute("src"));
    }
    for (const video of article.querySelectorAll('[data-testid="videoPlayer"] video[poster]')) {
      push(video.getAttribute("poster"));
    }
    for (const img of article.querySelectorAll('[data-testid="card.wrapper"] img')) {
      push(img.getAttribute("src"));
    }

    return urls.slice(0, MAX_IMAGES_PER_REPLY);
  };

  const hasUnloadedMedia = (article) =>
    Boolean(
      article.querySelector(
        '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]'
      )
    ) && tweetImages(article).length === 0;

  const authorHandle = (article) => {
    const authorName = article.querySelector('[data-testid="User-Name"]');
    if (!authorName) return "";

    for (const link of authorName.querySelectorAll("a[href]")) {
      const handle = handleFromHref(link.getAttribute("href"));
      if (handle) return handle;
    }

    return "";
  };

  const isAd = (article) =>
    Array.from(article.querySelectorAll("span")).some((span) => {
      if (span.closest(USER_TEXT_SELECTOR)) return false;
      return (span.textContent || "").trim() === "Ad";
    });

  const isReplyingToOwnHandle = (article) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (/^\s*Replying to\s*$/i.test(node.nodeValue || "")) {
        let container = node.parentElement;
        for (let depth = 0; container && container !== article && depth < 5; depth++) {
          const label = (container.textContent || "").trim();
          if (/^Replying to\b/i.test(label) && label.length < 240) {
            for (const link of container.querySelectorAll("a[href]")) {
              if (handleFromHref(link.getAttribute("href")) === OWN_HANDLE) return true;
            }
          }
          container = container.parentElement;
        }
      }
      node = walker.nextNode();
    }

    return false;
  };

  const commentScopes = () =>
    Array.from(document.querySelectorAll(COMMENT_SCOPES));

  const collectOwnPostComments = () => {
    const comments = [];
    const seen = new Set();
    const page = location.pathname.match(OWN_STATUS_PATH_PATTERN);

    const add = (article) => {
      if (!article || seen.has(article) || isOwnPost(article) || isAd(article)) return;
      const id = tweetIdFromArticle(article);
      if (!id) return;
      if (page && id === page[1]) return;

      seen.add(article);
      comments.push({
        id,
        kind: page?.[3] ? "quote" : "reply",
        author: authorHandle(article),
        text: tweetBody(article),
        ownText: tweetTexts(article).own.join("\n"),
        images: tweetImages(article),
        mediaPending: hasUnloadedMedia(article),
        target: article.closest('[data-testid="cellInnerDiv"]') || article
      });
    };

    const addAccount = (cell) => {
      if (!cell || seen.has(cell)) return;
      let handle = "";
      for (const link of cell.querySelectorAll("a[href]")) {
        handle = handleFromHref(link.getAttribute("href"));
        if (handle) break;
      }
      if (!handle || handle === OWN_HANDLE) return;

      const text = cleanText(
        Array.from(cell.querySelectorAll('[dir="auto"], [dir="ltr"]'))
          .filter((node) => !node.closest('[role="button"], button'))
          .filter((node) => !node.parentElement?.closest('[dir="auto"], [dir="ltr"]'))
          .map((node) => textWithEmoji(node))
          .join(" | ")
      ).slice(0, 800);

      seen.add(cell);
      comments.push({
        id: `account:${handle}`,
        kind: "account",
        author: handle,
        text: text || `@${handle}`,
        images: [],
        mediaPending: false,
        target: cell.closest('[data-testid="cellInnerDiv"]') || cell
      });
    };

    const addRepliesBelowFocal = (scope, findFocal) => {
      if (!scope) return;
      const cells = Array.from(
        scope.querySelectorAll('[data-testid="cellInnerDiv"]')
      );
      const focalIndex = findFocal
        ? cells.findIndex((cell) => {
          const article = cell.querySelector('article[data-testid="tweet"]');
          return article && containsStatusLink(article, page[1]);
        })
        : -1;

      cells.forEach((cell, index) => {
        if (index <= focalIndex) return;
        add(cell.querySelector('article[data-testid="tweet"]'));
      });
    };

    if (page?.[3]) {
      const column = document.querySelector('[data-testid="primaryColumn"]');
      for (const article of column?.querySelectorAll('article[data-testid="tweet"]') || []) {
        add(article);
      }
      for (const cell of column?.querySelectorAll('[data-testid="UserCell"]') || []) {
        addAccount(cell);
      }
    } else if (page) {
      addRepliesBelowFocal(
        document.querySelector('[data-testid="primaryColumn"]'),
        true
      );
      if (page[2]) {
        addRepliesBelowFocal(document.querySelector('[role="dialog"]'), false);
      }
    }

    for (const scope of commentScopes()) {
      for (const article of scope.querySelectorAll('article[data-testid="tweet"]')) {
        if (isReplyingToOwnHandle(article)) add(article);
      }
    }

    return comments;
  };

  const applyVerdict = (comment) => {
    comment.target.classList.add(HIDDEN_REPLY_CLASS);
    if (comment.mediaPending) return;
    if (!comment.text && !comment.images.length) return;

    if (comment.kind !== "account" && GEAR_QUESTION_PATTERN.test(comment.ownText)) return;

    const hash = hashText(`${comment.text}\n${comment.images.join("\n")}`);
    const cached = verdicts.get(comment.id);
    if (cached && cached.hash === hash) {
      comment.target.classList.toggle(HIDDEN_REPLY_CLASS, cached.hide);
      return;
    }

    if (Date.now() < retryAfter || inflight.has(comment.id)) return;

    inflight.add(comment.id);
    classifyQueue.set(comment.id, {
      id: comment.id,
      kind: comment.kind,
      author: comment.author,
      text: comment.text,
      images: comment.images,
      hash
    });
  };

  const STATUS_BANNER_ID = "x-count-masker-status";

  const showStatus = (message) => {
    let banner = document.getElementById(STATUS_BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = STATUS_BANNER_ID;
      document.body.appendChild(banner);
    }
    banner.textContent = message;
  };

  const clearStatus = () => {
    document.getElementById(STATUS_BANNER_ID)?.remove();
  };

  const flushClassifications = () => {
    const batch = Array.from(classifyQueue.values()).slice(0, 20);
    if (!batch.length) return;

    for (const item of batch) classifyQueue.delete(item.id);

    try {
      chrome.runtime.sendMessage(
        { type: "classify-replies", replies: batch },
        (response) => handleVerdicts(batch, response)
      );
    } catch (error) {
      for (const item of batch) inflight.delete(item.id);
      console.error("[x-count-masker] could not review replies", error);
      showStatus(
        "Replies are hidden because the extension was reloaded. Refresh this tab to review them."
      );
    }
  };

  const handleVerdicts = (batch, response) => {
    const failed = Boolean(chrome.runtime.lastError) || !response?.ok;
    for (const item of batch) inflight.delete(item.id);

    if (failed) {
      const reason =
        chrome.runtime.lastError?.message || response?.error || "unknown error";
      console.error("[x-count-masker] could not review replies", reason);
      showStatus(
        `Replies are hidden until they can be reviewed. Retrying in 15s. (${reason.slice(0, 160)})`
      );
      retryAfter = Date.now() + 15000;
      for (const item of batch) classifyQueue.set(item.id, item);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = 0;
        flushClassifications();
      }, 15000);
      return;
    }

    retryAfter = 0;
    clearStatus();

    for (const verdict of response.verdicts || []) {
      const item = batch.find((candidate) => candidate.id === verdict.id);
      if (!item || verdict.hash !== item.hash) continue;
      verdicts.set(verdict.id, { hide: Boolean(verdict.hide), hash: item.hash });
    }

    for (const item of batch) {
      const cached = verdicts.get(item.id);
      if (!cached || cached.hash !== item.hash) {
        verdicts.set(item.id, { hide: true, hash: item.hash });
      }
    }

    if (classifyQueue.size) flushClassifications();
    scheduleScan();
  };

  const queueClassifications = () => {
    if (!classifyQueue.size || flushTimer) return;
    const wait = Math.max(400, retryAfter - Date.now());
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      flushClassifications();
    }, wait);
  };

  const moderateOwnPostComments = () => {
    const comments = collectOwnPostComments();
    const activeTargets = new Set(comments.map((comment) => comment.target));

    for (const cell of document.querySelectorAll(`.${HIDDEN_REPLY_CLASS}`)) {
      if (!activeTargets.has(cell)) cell.classList.remove(HIDDEN_REPLY_CLASS);
    }

    if (!cacheReady) {
      for (const comment of comments) {
        comment.target.classList.add(HIDDEN_REPLY_CLASS);
      }
      return;
    }

    for (const comment of comments) applyVerdict(comment);
    queueClassifications();
  };

  chrome.storage.local.get(VERDICT_STORAGE_KEY, (data) => {
    for (const [id, entry] of Object.entries(data?.[VERDICT_STORAGE_KEY] || {})) {
      if (entry && typeof entry.hide === "boolean" && entry.hash) {
        verdicts.set(id, { hide: entry.hide, hash: entry.hash });
      }
    }
    cacheReady = true;
    scheduleScan();
  });

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
    moderateOwnPostComments();

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
