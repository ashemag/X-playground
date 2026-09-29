# X Playground

A small Manifest V3 Chrome extension that cuts down what reaches you on X, so you can keep posting and making things without the numbers or the pile-ons.

## Why

This started as a way to make X a creative flywheel: post, learn, post again, without every post being graded by likes and view counts.

It now ships on its **strictest settings**, in response to a recent flood of hate speech. The defaults are tuned to filter out incoming messaging: notifications are blocked, engagement counts are hidden, and you can't reply to or like your own posts, which is where most of the incoming replies land. Everything is on by default. You can loosen any of it once things calm down (see [Loosening the settings](#loosening-the-settings)).

## What it does

### Blocks notifications

- Grays out the Notifications tab (the icon is replaced with a gray circle) and blocks clicking it or any other link to `/notifications`.
- Redirects to Home whenever you land on a `/notifications` page, including from a bookmark or the back button.
- Hides unread badges on the sidebar and bottom-bar tabs.
- Strips the unread count from the browser tab title and swaps out the unread favicon.

### Locks actions on your own posts

A post counts as yours when its author handle matches `OWN_HANDLE` in `src/content.js` (currently `ashebytes`). That includes your replies to other people. On those posts:

- The reply and like buttons are dimmed and can't be clicked. That includes un-liking.
- The `r` (reply) and `l` (like) keyboard shortcuts are blocked when a post of yours is focused.
- Clicking the post opens it as usual, with its replies filtered (see below).
- Repost, bookmark, share, and view analytics still work.

Your profile page is mostly your own posts, so most reply buttons there will be locked.

Other people's posts are not locked. You can reply to, like, and repost them as usual.

### Hides negative replies

Replies on your posts are sent to GPT 5.6 Sol (`gpt-5.6-sol`), including emoji and attached images. Only supportive, kind, neutral, and genuinely curious replies stay visible. Everything hateful, mean, rude, negative, or critical is hidden: hate speech, insults, mockery, sarcasm, condescension, backhanded compliments, mean emoji like 🤡, and put-down memes. Polite criticism, disagreement, corrections, and unsolicited advice are hidden too. When a reply could reasonably read as a dig or a criticism, it's hidden. Any question or comment about your camera, lens, phone, gear, or setup is always hidden. Obvious wordings like "what camera do you use" are caught by a rule in `src/content.js` (`GEAR_QUESTION_PATTERN`) before they reach the model, and GPT 5.6 Sol catches the other variants. That covers:

- the replies under your post when you open it, including the photo viewer's reply panel
- replies to you that show up in the timeline
- your post's activity pages: quotes are judged like replies, and on the Reposts and Likes lists, accounts with a hateful or mocking name or bio, or one aimed at you, are hidden

If a review can't run, a small banner at the bottom of the page says why. For example, after you reload the extension, it asks you to refresh the tab.

Your own replies stay visible. A reply stays hidden until the review comes back, so a mean one doesn't flash on screen. If a review fails, the reply stays hidden and is retried. If OpenAI can't load a reply's image, an image-only reply stays hidden. Verdicts are cached in the extension, keyed by the reply and its content. The OpenAI key is kept in `chrome.storage.local` (never in source), under the `openaiApiKey` key.

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

Follower counts on profiles are hidden. Double-click a hidden count to show it, and double-click again to hide it. Following counts are not hidden.

## What it doesn't do

This extension hides signals in the page. It doesn't stop anyone from posting. In particular:

- **Only replies the page has rendered are reviewed.** A reply that never loads into the desktop site is untouched. Videos are judged by their thumbnail only.
- **Messages are not blocked.** The Messages tab and DMs work as normal; only the unread badge on the tab is hidden.
- **Mentions can still surface elsewhere,** for example in search, when the reply isn't shown as a comment on your post.
- **It only works in Chrome on desktop.** The X mobile apps and other browsers are unaffected.

## Setup

1. In `src/content.js`, set `OWN_HANDLE` to your X handle without the `@`.
2. Set the OpenAI key used to review replies by running, in the service worker console, `chrome.storage.local.set({ openaiApiKey: "..." })` with the `OPENAI_API_KEY` value from the `ashe_ai` `.env`.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select this repo's folder. Accept the `api.openai.com` permission when Chrome asks.
7. Visit or refresh X.

After editing any file, click the reload icon on the extension in `chrome://extensions` and refresh X.

## Loosening the settings

The defaults are the strictest setting. There's no options page yet, so each setting is changed in the code:

- **Unlock replying to or liking your own posts**: remove entries from `LOCKED_ACTION_TEST_IDS` and `LOCKED_SHORTCUT_KEYS` in `src/content.js`, and remove the matching `.x-count-masker-own-post [data-testid="..."]` selectors in `src/content.css` so the buttons are no longer dimmed.
- **Bring back notifications**: in `src/content.js`, delete the `blockNotificationsPage` and `blockNotificationsLinks` calls in `scan()`, the `popstate` listener, and the click listener that checks `NOTIFICATIONS_LINK_SELECTOR`. Then delete the `AppTabBar_Notifications_Link` rules in `src/content.css`. To keep unread badges, also delete the `maskNavBadges`, `maskTitleCount`, and `maskFaviconBadge` calls in `scan()`.
- **Show a specific count again** (for example, likes): remove its `data-testid` entries (such as `"like"` and `"unlike"`) from `ACTION_TEST_IDS` in `src/content.js`, and remove its word (such as `Likes?`) from `MASKED_METRIC_LABEL_WORDS`, which covers the counts on a post's own page. Reply and repost counts are also hidden by a rule near the top of `src/content.css`; delete the matching lines there too.
- **Show every reply again, including negative ones**: delete the `moderateOwnPostComments()` call in `scan()` in `src/content.js`.
- **Show follower counts by default**: delete the `maskFollowerCount` loop in `scan()` in `src/content.js`.

## Notes

- The extension runs as a content script on `x.com` and `twitter.com`, and keeps watching for new posts loaded while you scroll.
- It does not block network requests or change anything on your account. Counts are hidden in the page with CSS. Reply text is sent to OpenAI only to decide whether to hide it. Disabling the extension brings everything back.
