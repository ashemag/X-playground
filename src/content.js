(() => {
  // Temporarily paused to avoid API charges. The manifest also disables the worker.
  const LLM_FILTER_ENABLED = false;
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
    .join(",") + ", .x-engagement-button";
  const VIEW_ACTION_SELECTOR = '[data-testid="view"], [data-testid="analytics"], article a[href$="/analytics"]';
  const FOLLOWER_LINK_SELECTOR =
    'a[href*="/followers"], a[href*="/verified_followers"]';
  const METRIC_TEXT_SELECTOR =
    'span, div[dir="auto"], [data-testid="app-text-transition-container"]';
  const USER_TEXT_SELECTOR =
    '[data-testid="tweetText"], [data-testid="card.wrapper"], article [dir="auto"].whitespace-pre-wrap';
  const POST_TEXT_SELECTOR =
    '[data-testid="tweetText"], [dir="auto"].whitespace-pre-wrap';
  const PRIMARY_COLUMN_SELECTOR = '[data-testid="primaryColumn"], main';

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
    // A pill's textContent can be just a number even when it also holds the icon.
    if (element.querySelector("svg")) return;
    if (element.classList.contains("x-count-masker-count")) return;
    element.classList.add("x-count-masker-count");
    element.setAttribute("aria-hidden", "true");
  };

  const markFollowerCountNode = (element) => {
    element.classList.add("x-count-masker-follower-count");
    element.classList.remove("x-count-masker-follower-count--revealed");
    element.removeAttribute("title");
    element.setAttribute("aria-hidden", "true");
  };

  const sanitizeActionLabel = (element) => {
    const label = element.getAttribute("aria-label");
    if (!label || element.dataset.xCountMaskerLastLabel === label) return;

    element.dataset.xCountMaskerLastLabel = label;

    const sanitized = label
      .replace(new RegExp(String.raw`\b${COUNT_VALUE_PATTERN}\s+(Replies|Reply|Reposts|Repost|Retweets|Retweet|Quotes|Quote|Likes|Like|Bookmarks|Bookmark|Impressions|Impression|Views|View)\b`, "gi"), "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (sanitized && sanitized !== label) {
      element.setAttribute("aria-label", sanitized);
    }
  };

  const maskActionCounts = (actionElement) => {
    if (!actionElement) return;
    sanitizeActionLabel(actionElement);

    // The new X UI animates individual digits. Hide the whole visual, including
    // the temporary old/new digits during a transition, before checking text.
    for (const visual of actionElement.querySelectorAll(".x-animated-count-visual")) {
      maskVisibleCountNode(visual);
    }

    const candidates = actionElement.querySelectorAll("span, div");

    for (const candidate of candidates) {
      if (candidate.closest(USER_TEXT_SELECTOR)) continue;
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
      if (candidate.closest(USER_TEXT_SELECTOR)) continue;
      const text = candidate.textContent || "";
      if (isCountText(text)) {
        maskVisibleCountNode(candidate);
      }
    }
  };

  const maskNearbyViewMetricCount = (element) => {
    let container = element;

    for (let depth = 0; container && depth < 5; depth++) {
      if (container.matches("article")) return;
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

  const isOwnFollowerLink = (linkElement) => {
    if (!linkElement) return false;
    try {
      const url = new URL(linkElement.getAttribute("href") || "", "https://x.com");
      if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(url.hostname)) return false;
      const match = url.pathname.match(/^\/([^/]+)\/(?:followers|verified_followers)(?:\/|$)/i);
      return match?.[1].toLowerCase() === OWN_HANDLE.toLowerCase();
    } catch {
      return false;
    }
  };

  const maskFollowerCount = (linkElement) => {
    const isOwn = isOwnFollowerLink(linkElement);
    linkElement.classList.toggle("x-count-masker-own-followers", isOwn);
    if (!isOwn) {
      // X can reuse profile/card elements when navigating between accounts.
      for (const element of linkElement.querySelectorAll(".x-count-masker-follower-count")) {
        element.classList.remove("x-count-masker-follower-count", "x-count-masker-follower-count--revealed");
        element.removeAttribute("aria-hidden");
      }
      return;
    }

    // X can put the exact count in a tooltip on the link or a nested element.
    linkElement.removeAttribute("title");
    for (const element of linkElement.querySelectorAll("[title]")) {
      element.removeAttribute("title");
    }

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
      if (!viewAction.matches('a[href$="/analytics"], .x-engagement-button')) {
        maskNearbyViewMetricCount(viewAction);
      }
    }

    for (const labelledElement of root.querySelectorAll("[aria-label]")) {
      const label = labelledElement.getAttribute("aria-label") || "";
      if (!VIEW_METRIC_LABEL_PATTERN.test(label)) continue;

      sanitizeActionLabel(labelledElement);
      maskActionCounts(labelledElement);
      if (!labelledElement.matches(".x-engagement-button")) {
        maskNearbyViewMetricCount(labelledElement);
      }
    }
  };

  const NAV_TAB_SELECTOR = '[data-testid^="AppTabBar_"], nav a[aria-label]';
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

      for (const badge of tab.querySelectorAll("span[aria-label]")) {
        if (!/^\d+\+?$/.test(badge.getAttribute("aria-label") || "")) continue;
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
      link.classList.add("x-count-masker-notifications");
      link.setAttribute("tabindex", "-1");
      link.setAttribute("aria-disabled", "true");
    }
  };

  const OWN_HANDLE = "ashebytes";
  const OWN_POST_CLASS = "x-count-masker-own-post";
  const LOCKED_ACTION_TEST_IDS = [
    "like",
    "unlike"
  ];
  const LOCKED_ACTION_SELECTOR = LOCKED_ACTION_TEST_IDS
    .map((testId) => `.${OWN_POST_CLASS} [data-testid="${testId}"]`)
    .join(",") + `, .${OWN_POST_CLASS} .x-engagement-button:is([aria-label="Like"], [aria-label="Unlike"], [aria-label="Undo like"]), .${OWN_POST_CLASS} .x-engagement-button:has(use[href="#icon-heart"], use[href="#icon-heart-fill"])`;
  const LOCKED_SHORTCUT_KEYS = new Set(["l"]);

  const isOwnPost = (article) => {
    return authorHandle(article) === OWN_HANDLE;
  };

  const lockOwnPosts = (root) => {
    for (const article of postArticles(root)) {
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
  const STATUS_PATH_PATTERN =
    /^\/([A-Za-z0-9_]+)\/status\/(\d+)(\/photo\/\d+|\/video\/\d+)?(\/retweets(?:\/with_comments)?|\/quotes|\/likes)?\/?$/i;

  const parseStatusPath = () => {
    const match = location.pathname.match(STATUS_PATH_PATTERN);
    if (!match) return null;
    return {
      handle: match[1].toLowerCase(),
      id: match[2],
      media: Boolean(match[3]),
      activity: Boolean(match[4])
    };
  };
  const containsStatusLink = (article, statusId) => {
    const statusLinkPattern = new RegExp(`/status/${statusId}$`);

    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      if (statusLinkPattern.test(link.getAttribute("href") || "")) return true;
    }

    return false;
  };

  const VERDICT_STORAGE_KEY = "replyVerdicts.v9";
  const verdicts = new Map();
  const inflight = new Set();
  const classifyQueue = new Map();
  let cacheReady = !LLM_FILTER_ENABLED;
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
    const href = timeLink?.getAttribute("href") ||
      article.querySelector('a[href*="/status/"]')?.getAttribute("href") || "";
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
    if (element.closest("article") !== article) return true;
    const quoted = element.closest('[role="link"]');
    if (!quoted || quoted === article || !article.contains(quoted)) return false;

    const authorName = article.querySelector('[data-testid="User-Name"]');
    if (authorName && quoted.contains(authorName)) return false;
    return Boolean(quoted.querySelector('[data-testid="User-Name"], a[href*="/status/"]'));
  };

  const tweetTexts = (article) => {
    const own = [];
    const quoted = [];

    for (const node of article.querySelectorAll(POST_TEXT_SELECTOR)) {
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
    // Both layouts put the author's profile links before post text and quotes.
    for (const link of (authorName || article).querySelectorAll("a[href]")) {
      if (!authorName && !/^\/(?:[A-Za-z0-9_]+)\/?$/.test(link.getAttribute("href") || "")) continue;
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

  const postArticles = (scope) =>
    scope ? Array.from(scope.querySelectorAll('article')).filter((article) =>
      !article.parentElement?.closest("article") &&
      (article.matches('[data-testid="tweet"]') || article.querySelector('a[href*="/status/"]'))
    ) : [];

  const conversationHost = (page) => {
    if (page.media || page.activity) return page.handle;

    const articles = postArticles(document.querySelector(PRIMARY_COLUMN_SELECTOR));
    const focalIndex = articles.findIndex(
      (article) =>
        tweetIdFromArticle(article) === page.id || containsStatusLink(article, page.id)
    );
    if (focalIndex === -1) return page.handle === OWN_HANDLE ? OWN_HANDLE : "";
    return authorHandle(articles[0]);
  };

  let filteringActive = false;

  const collectOwnPostComments = () => {
    const comments = [];
    const seen = new Set();
    const page = parseStatusPath();
    filteringActive = Boolean(page) && conversationHost(page) === OWN_HANDLE;
    if (!filteringActive) return comments;

    const add = (article) => {
      if (!article || seen.has(article) || isOwnPost(article) || isAd(article)) return;
      const id = tweetIdFromArticle(article);
      if (!id) return;

      seen.add(article);
      comments.push({
        id,
        kind: page.activity ? "quote" : "reply",
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

    const column = document.querySelector(PRIMARY_COLUMN_SELECTOR);

    if (page.activity) {
      for (const article of postArticles(column)) add(article);
      for (const cell of column?.querySelectorAll('[data-testid="UserCell"]') || []) {
        addAccount(cell);
      }
      return comments;
    }

    if (page.media) {
      for (const article of postArticles(document.querySelector('[role="dialog"]'))) {
        add(article);
      }
    }

    const columnIsConversation = postArticles(column).some(
      (article) =>
        tweetIdFromArticle(article) === page.id || containsStatusLink(article, page.id)
    );
    if (!page.media || columnIsConversation) {
      for (const article of postArticles(column)) add(article);
    }

    return comments;
  };

  const COLLAPSED_REPLIES_PATTERN =
    /\bshow (?:more|additional) replies\b|\bshow probable spam\b/i;
  const expandedReplySections = new WeakSet();

  const expandCollapsedReplies = () => {
    const column = document.querySelector(PRIMARY_COLUMN_SELECTOR);
    if (!column) return;

    for (const cell of column.querySelectorAll('[data-testid="cellInnerDiv"], li')) {
      if (expandedReplySections.has(cell) || cell.querySelector("article")) continue;
      if (!COLLAPSED_REPLIES_PATTERN.test(cell.textContent || "")) continue;

      const button = cell.querySelector('[role="button"], button');
      if (!button) continue;
      expandedReplySections.add(cell);
      button.click();
    }
  };

  const MEDIA_WAIT_MS = 8000;
  const firstSeen = new Map();

  const setReason = (comment, reason) => {
    if (comment.target.dataset.xPlaygroundReason !== reason) {
      comment.target.dataset.xPlaygroundReason = reason;
    }
  };

  const applyVerdict = (comment) => {
    // Hide only on a positive match; loading and review failures stay visible.
    comment.target.classList.remove(HIDDEN_REPLY_CLASS);

    if (!LLM_FILTER_ENABLED) {
      setReason(comment, "ai-paused");
      return false;
    }

    if (!firstSeen.has(comment.id)) {
      firstSeen.set(comment.id, Date.now());
      if (comment.mediaPending) setTimeout(scheduleScan, MEDIA_WAIT_MS + 50);
    }
    if (comment.mediaPending) {
      if (Date.now() - firstSeen.get(comment.id) < MEDIA_WAIT_MS) {
        setReason(comment, "media-not-loaded");
        return true;
      }
      if (!comment.text) {
        setReason(comment, "media-not-loaded");
        return false;
      }
      comment.text = `${comment.text}\n[also has a photo or video that could not be loaded]`;
    }
    if (!comment.text && !comment.images.length) {
      setReason(comment, "no-text-found");
      return false;
    }

    const hash = hashText(`${comment.text}\n${comment.images.join("\n")}`);
    const cached = verdicts.get(comment.id);
    if (cached && cached.hash === hash && (!cached.expiresAt || Date.now() < cached.expiresAt)) {
      comment.target.classList.toggle(HIDDEN_REPLY_CLASS, cached.hide);
      setReason(comment, cached.hide ? cached.reason || "model" : "shown");
      return false;
    }

    setReason(comment, "reviewing");
    if (Date.now() < retryAfter || inflight.has(comment.id)) return true;

    inflight.add(comment.id);
    classifyQueue.set(comment.id, {
      id: comment.id,
      kind: comment.kind,
      author: comment.author,
      text: comment.text,
      ownText: comment.ownText,
      images: comment.images,
      hash
    });
    return true;
  };

  const STATUS_BANNER_ID = "x-count-masker-status";
  const RELOADED_MESSAGE =
    "Reply review is unavailable. Unreviewed replies stay visible. Refresh this tab after reloading the extension.";
  let statusError = "";
  let slowReview = false;
  let wasReviewing = false;
  let doneTimer = 0;

  const renderStatus = (message, loading) => {
    if (!document.body) return;
    let banner = document.getElementById(STATUS_BANNER_ID);
    if (!message) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = STATUS_BANNER_ID;
      banner.setAttribute("role", "status");
      document.body.appendChild(banner);
    }
    if (banner.textContent !== message) banner.textContent = message;
    banner.classList.toggle("x-count-masker-status--loading", loading);
  };

  const showStatus = (message) => {
    statusError = message;
    renderStatus(message, false);
  };

  const clearStatus = () => {
    statusError = "";
  };

  const updateReviewStatus = (pendingCount, commentCount, hiddenCount = 0) => {
    if (!LLM_FILTER_ENABLED) {
      renderStatus(filteringActive ? "Reply review paused" : "", false);
      return;
    }
    if (!chrome.runtime?.id) statusError = RELOADED_MESSAGE;
    const onOwnPostPage = filteringActive;

    if (statusError) {
      clearTimeout(doneTimer);
      doneTimer = 0;
      renderStatus(statusError, false);
      return;
    }

    if (pendingCount > 0) {
      clearTimeout(doneTimer);
      doneTimer = 0;
      wasReviewing = true;
      renderStatus(
        slowReview
          ? "Still reviewing replies… If this stays, reload the extension in chrome://extensions and refresh this tab."
          : "Reviewing replies…",
        true
      );
      return;
    }

    if (onOwnPostPage) {
      clearTimeout(doneTimer);
      doneTimer = 0;
      wasReviewing = false;
      renderStatus(
        commentCount === 0
          ? "Filter on · no replies loaded on this page yet"
          : hiddenCount === 0
            ? "Filter on · no loaded replies hidden"
            : "Replies filtered",
        false
      );
      return;
    }

    if (wasReviewing) {
      wasReviewing = false;
      renderStatus("Replies reviewed", false);
      doneTimer = setTimeout(() => {
        doneTimer = 0;
        renderStatus("", false);
      }, 1500);
      return;
    }

    if (!doneTimer) renderStatus("", false);
  };

  const flushClassifications = () => {
    if (!LLM_FILTER_ENABLED) return;
    const batch = Array.from(classifyQueue.values()).slice(0, 20);
    if (!batch.length) return;

    for (const item of batch) {
      classifyQueue.delete(item.id);
      inflight.add(item.id);
    }

    const slowTimer = setTimeout(() => {
      slowReview = true;
      scheduleScan();
    }, 20000);

    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(slowTimer);
      clearTimeout(responseTimer);
      slowReview = false;
      handleVerdicts(batch, response);
    };
    const responseTimer = setTimeout(() => {
      finish({ ok: false, error: "Review timed out" });
    }, 30000);

    try {
      chrome.runtime.sendMessage(
        { type: "classify-replies", replies: batch },
        finish
      );
    } catch (error) {
      console.error("[x-count-masker] could not review replies", error);
      finish({ ok: false, error: "Extension connection unavailable; refresh this tab" });
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
        `Review unavailable · unreviewed replies stay visible. Retrying in 15s. (${reason.slice(0, 160)})`
      );
      retryAfter = Date.now() + 15000;
      for (const item of batch) classifyQueue.set(item.id, item);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = 0;
        flushClassifications();
      }, 15000);
      scheduleScan();
      return;
    }

    retryAfter = 0;
    clearStatus();

    for (const verdict of response.verdicts || []) {
      const item = batch.find((candidate) => candidate.id === verdict.id);
      if (!item || verdict.hash !== item.hash || typeof verdict.hide !== "boolean") continue;
      verdicts.set(verdict.id, {
        hide: verdict.hide,
        hash: item.hash,
        reason: verdict.reason || "model",
        expiresAt: verdict.reason === "no-verdict" ? Date.now() + 60000 : 0
      });
    }

    for (const item of batch) {
      const cached = verdicts.get(item.id);
      if (!cached || cached.hash !== item.hash) {
        verdicts.set(item.id, { hide: false, hash: item.hash, reason: "no-verdict", expiresAt: Date.now() + 60000 });
      }
    }

    if (batch.some((item) => verdicts.get(item.id)?.reason === "no-verdict")) {
      showStatus("Some replies could not be reviewed and remain visible. Retrying in 60s.");
      setTimeout(scheduleScan, 60050);
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

  let lastPath = "";

  const resetOnNavigation = () => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;

    for (const [id, entry] of verdicts) {
      if (entry.reason === "no-verdict") verdicts.delete(id);
    }
    firstSeen.clear();
    slowReview = false;
    wasReviewing = false;
  };

  const moderateOwnPostComments = () => {
    resetOnNavigation();
    const comments = collectOwnPostComments();
    if (filteringActive) expandCollapsedReplies();
    const activeTargets = new Set(comments.map((comment) => comment.target));

    for (const cell of document.querySelectorAll(`.${HIDDEN_REPLY_CLASS}`)) {
      if (activeTargets.has(cell)) continue;
      cell.classList.remove(HIDDEN_REPLY_CLASS);
      delete cell.dataset.xPlaygroundReason;
    }

    if (!cacheReady) {
      for (const comment of comments) {
        comment.target.classList.remove(HIDDEN_REPLY_CLASS);
      }
      updateReviewStatus(comments.length, comments.length);
      return;
    }

    let pendingCount = 0;
    for (const comment of comments) {
      if (applyVerdict(comment)) pendingCount++;
    }
    queueClassifications();
    const hiddenCount = comments.filter((comment) =>
      comment.target.classList.contains(HIDDEN_REPLY_CLASS)
    ).length;
    updateReviewStatus(pendingCount, comments.length, hiddenCount);
  };

  document.documentElement.dataset.xPlaygroundVersion =
    chrome.runtime.getManifest().version;

  if (LLM_FILTER_ENABLED) chrome.storage.local.get(VERDICT_STORAGE_KEY, (data) => {
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
    for (const article of postArticles(scanRoot)) {
      wrapMetricCountText(article, MASKED_METRIC_TEXT_PATTERN);
      maskLabelledMetricCounts(article);
      maskViewMetricCounts(article);
    }
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
  document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });

  // X renders its count tooltip in a separate popup, not a title attribute.
  // Stop the events that open it before they reach X's delegated handlers.
  for (const eventName of [
    "mouseover", "mouseenter", "pointerover", "pointerenter", "focus", "focusin"
  ]) {
    document.addEventListener(
      eventName,
      (event) => {
        if (!isOwnFollowerLink(event.target.closest?.(FOLLOWER_LINK_SELECTOR))) return;
        event.stopImmediatePropagation();
      },
      true
    );
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!isOwnFollowerLink(event.target.closest?.(FOLLOWER_LINK_SELECTOR))) return;
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
      const ownPost = active.closest(`.${OWN_POST_CLASS}`) ||
        (active.matches('[role="link"]') && active.querySelector(`article.${OWN_POST_CLASS}`));
      if (!ownPost) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  window.addEventListener("popstate", blockNotificationsPage);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "aria-label", "title", "data-testid", "aria-pressed"]
  });
})();
