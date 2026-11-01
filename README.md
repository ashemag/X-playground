# X Playground

A small Manifest V3 Chrome extension that cuts down what reaches you on X, so you can keep posting and making things without the numbers or the pile-ons.

## Why

This started as a way to make X a creative flywheel: post, learn, post again, without every post being graded by likes and view counts.

Notifications are blocked, engagement counts are hidden, and likes on your own posts are locked. You can still reply to your own posts. AI reply review is temporarily paused. Replies and quote tweets stay visible, including camera mentions and previously AI-hidden replies. See [Changing the settings](#changing-the-settings) for the other controls.

## What it does

### Blocks notifications

- Grays out the Notifications tab (the icon is replaced with a gray circle) and blocks clicking it or any other link to `/notifications`.
- Redirects to Home whenever you land on a `/notifications` page, including from a bookmark or the back button.
- Hides unread badges on the sidebar and bottom-bar tabs.
- Strips the unread count from the browser tab title and swaps out the unread favicon.

### Locks actions on your own posts

A post counts as yours when its author handle matches `OWN_HANDLE` in `src/content.js` (currently `ashebytes`). That includes your replies to other people. On those posts:

- The like button is dimmed and can't be clicked. That includes un-liking.
- The `l` (like) keyboard shortcut is blocked when a post of yours is focused.
- You can reply to your own posts, from the reply button, the `r` shortcut, or the reply box on the post's page. The reply count stays hidden.
- Clicking the post opens it as usual, with its replies visible while review is paused.
- Repost, bookmark, share, and view analytics still work.

Other people's posts are not locked. You can reply to, like, and repost them as usual.

### Reply review is paused

No replies or images are sent to OpenAI, no API key or credits are needed, and old model verdicts are ignored. Camera mentions, replies, and quote tweets remain visible. Collapsed reply sections still open automatically.

The AI implementation is retained for later. Restoring it requires setting `LLM_FILTER_ENABLED` to `true` in `src/content.js` and restoring the `src/background.js` service worker and `https://api.openai.com/*` host permission in `manifest.json`. It would then require the locally configured API key and credits again.

### Hides engagement counts

On every post, including other people's, it hides the counts for:

- replies
- reposts
- quotes
- likes
- bookmarks
- views and impressions

It hides them in the timeline and on a post's own page, including in screen-reader labels. Apart from the locks on your own posts, the buttons themselves keep working.

### Hides follower counts

Only your follower count (the account configured by `OWN_HANDLE`) stays hidden, including when double-clicked. Hovering or focusing your follower link cannot open X's count tooltip. Other people's follower counts and tooltips remain visible. Following counts are not hidden.

## What it doesn't do

This extension hides signals in the page. It doesn't stop anyone from posting. In particular:

- **Replies and images are not reviewed while AI is paused.**
- **Messages are not blocked.** The Messages tab and DMs work as normal; only the unread badge on the tab is hidden.
- **Mentions can still surface elsewhere,** for example in search, when the reply isn't shown as a comment on your post.
- **It only works in Chrome on desktop.** The X mobile apps and other browsers are unaffected.

## Setup

1. In `src/content.js`, set `OWN_HANDLE` to your X handle without the `@`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this repo's folder.
6. Visit or refresh X.

No API key is needed while AI review is paused.

After editing any file, click the reload icon on the extension in `chrome://extensions` and refresh X.

## Changing the settings

There's no options page yet, so each setting is changed in the code:

- **Unlock liking your own posts**: remove `"like"` and `"unlike"` from `LOCKED_ACTION_TEST_IDS` and `"l"` from `LOCKED_SHORTCUT_KEYS` in `src/content.js`, and remove the matching `.x-count-masker-own-post [data-testid="..."]` selectors in `src/content.css` so the button is no longer dimmed.
- **Bring back notifications**: in `src/content.js`, delete the `blockNotificationsPage` and `blockNotificationsLinks` calls in `scan()`, the `popstate` listener, and the click listener that checks `NOTIFICATIONS_LINK_SELECTOR`. Then delete the `AppTabBar_Notifications_Link` rules in `src/content.css`. To keep unread badges, also delete the `maskNavBadges`, `maskTitleCount`, and `maskFaviconBadge` calls in `scan()`.
- **Show a specific count again** (for example, likes): remove its `data-testid` entries (such as `"like"` and `"unlike"`) from `ACTION_TEST_IDS` in `src/content.js`, and remove its word (such as `Likes?`) from `MASKED_METRIC_LABEL_WORDS`, which covers the counts on a post's own page. Reply and repost counts are also hidden by a rule near the top of `src/content.css`; delete the matching lines there too.
- **Show follower counts by default**: delete the `maskFollowerCount` loop in `scan()` in `src/content.js`.

## Notes

- Version 0.3.15 supports X's October 2026 desktop layout, including the new animated engagement counts, post-detail view totals, navigation badges, author links, and reply text. The earlier layout remains supported. Numbers in post text and unrelated profile totals are left alone.

- For regression checks, use Node 26+ (or a compatible Node version supported by jsdom), run `npm ci`, then `npm test`. To also check sample comments against the live model using the locally configured key, run `RUN_LIVE_MODERATION=1 node --test tests/moderation.test.cjs` (uses the API).

- The extension runs as a content script on `x.com` and `twitter.com`, and keeps watching for new posts loaded while you scroll.
- It does not block network requests or change anything on your account. Counts are hidden in the page with CSS. No reply text or images are sent to OpenAI while AI review is paused. Disabling the extension brings everything back.
