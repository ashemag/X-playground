# X Playground

A small Manifest V3 Chrome extension that turns X into a place to make things, not a scoreboard.

## Why

Public metrics make posting feel like a performance review. Every like count, reply count, and notification badge pulls attention away from the work and toward how the work is being judged. That makes it harder to post early, post rough ideas, and learn in public.

X Playground removes those signals so X can work as a creative flywheel: you post, you notice what you learned, and you post again, without checking the numbers after each one. The goal is a psychologically safer place to experiment, where you can still read, reply, and connect with people without being graded.

## What it does

It hides engagement counts on every post while leaving the buttons clickable:

- replies
- reposts
- quotes
- likes
- bookmarks
- impressions
- views

It masks follower counts on profiles. Double-click a hidden count to show it, and double-click again to hide it.

It removes notification signals:

- hides unread badges on sidebar and bottom-bar tabs
- strips unread counts from the tab title and swaps out the unread favicon
- grays out the Notifications tab, blocks clicking it, and redirects `/notifications` to Home

On your own posts, the reply and like buttons are locked (clicks and the `r`/`l` shortcuts are blocked), so you post and move on instead of tending to your own posts. You can still reply to, like, and repost other people's posts as usual.

The extension runs as a content script on `x.com` and `twitter.com`. It scans the current page and keeps watching for new posts loaded while you scroll.

## Setup

1. In `src/content.js`, set `OWN_HANDLE` to your X handle without the `@` (it defaults to `ashebytes`).
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this repo's folder.
6. Visit or refresh X.

After editing any file, click the reload icon on the extension in `chrome://extensions` and refresh X.

## Loosening the settings

The defaults are the most conservative setting: everything that can turn posting into a numbers game is hidden or blocked. That's a starting point, not a rule. If something is more helpful than harmful for you, turn it back on. Each setting is a value in the code:

- **Show a specific count again** (for example, likes): remove its `data-testid` entries (such as `"like"` and `"unlike"`) from `ACTION_TEST_IDS` in `src/content.js`, and remove its word (such as `Likes?`) from `MASKED_METRIC_LABEL_WORDS`, which covers the counts on a post's own page. Reply and repost counts are also hidden by a rule near the top of `src/content.css`; delete the matching lines there too.
- **Show follower counts by default**: delete the `maskFollowerCount` loop in `scan()` in `src/content.js`.
- **Bring back notifications**: in `src/content.js`, delete the `blockNotificationsPage` and `blockNotificationsLinks` calls, the `popstate` listener, and the click listener that checks `NOTIFICATIONS_LINK_SELECTOR`. Then delete the `AppTabBar_Notifications_Link` rules in `src/content.css`. To keep unread badges, also delete the `maskNavBadges`, `maskTitleCount`, and `maskFaviconBadge` calls in `scan()`.
- **Unlock actions on your own posts**: remove entries from `LOCKED_ACTION_TEST_IDS` and `LOCKED_SHORTCUT_KEYS` in `src/content.js`, and remove the matching `.x-count-masker-own-post [data-testid="..."]` selectors in `src/content.css` so the buttons are no longer dimmed.

## Notes

- The extension does not block network requests or modify your account data.
- Counts are hidden in the page UI with CSS, and new counts loaded during infinite scroll are masked automatically.
