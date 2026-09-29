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
- Clicking the post body, timestamp, photos, or "Show more" doesn't open the post's page, so you can't reach its replies that way. `Enter` and `o` are blocked too. If you land on the post's page anyway (a link or a typed URL), everything below your post is hidden except your own replies, and the same goes for the reply panel in the photo viewer. Your name, avatar, links in your text, link previews, videos, and quoted posts still work.
- Repost, bookmark, share, and view analytics still work.

Your profile page is mostly your own posts, so most reply buttons there will be locked.

Other people's posts are not locked. You can reply to, like, and repost them as usual.

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

This extension hides signals in the page. It doesn't filter out content, so it won't stop hate speech from being posted or delivered. In particular:

- **Replies are still there.** If you open one of your posts, the replies under it are still visible; only their count is hidden.
- **Messages are not blocked.** The Messages tab and DMs work as normal; only the unread badge on the tab is hidden.
- **Mentions can still surface elsewhere,** for example in search or in replies that show up in your timeline.
- **It only works in Chrome on desktop.** The X mobile apps and other browsers are unaffected.

To filter at the source, pair it with X's own settings: limit who can reply to your posts, mute words and accounts, and restrict who can message you.

## Setup

1. In `src/content.js`, set `OWN_HANDLE` to your X handle without the `@`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this repo's folder.
6. Visit or refresh X.

After editing any file, click the reload icon on the extension in `chrome://extensions` and refresh X.

## Loosening the settings

The defaults are the strictest setting. There's no options page yet, so each setting is changed in the code:

- **Unlock replying to or liking your own posts**: remove entries from `LOCKED_ACTION_TEST_IDS` and `LOCKED_SHORTCUT_KEYS` in `src/content.js`, and remove the matching `.x-count-masker-own-post [data-testid="..."]` selectors in `src/content.css` so the buttons are no longer dimmed.
- **Allow opening your own posts**: delete the `click`/`auxclick` listener that calls `opensOwnPost` and the `keydown` listener for `Enter`/`o` in `src/content.js`.
- **Bring back notifications**: in `src/content.js`, delete the `blockNotificationsPage` and `blockNotificationsLinks` calls in `scan()`, the `popstate` listener, and the click listener that checks `NOTIFICATIONS_LINK_SELECTOR`. Then delete the `AppTabBar_Notifications_Link` rules in `src/content.css`. To keep unread badges, also delete the `maskNavBadges`, `maskTitleCount`, and `maskFaviconBadge` calls in `scan()`.
- **Show a specific count again** (for example, likes): remove its `data-testid` entries (such as `"like"` and `"unlike"`) from `ACTION_TEST_IDS` in `src/content.js`, and remove its word (such as `Likes?`) from `MASKED_METRIC_LABEL_WORDS`, which covers the counts on a post's own page. Reply and repost counts are also hidden by a rule near the top of `src/content.css`; delete the matching lines there too.
- **Show follower counts by default**: delete the `maskFollowerCount` loop in `scan()` in `src/content.js`.

## Notes

- The extension runs as a content script on `x.com` and `twitter.com`, and keeps watching for new posts loaded while you scroll.
- It does not block network requests or change anything on your account. Counts are hidden in the page with CSS, and disabling the extension brings everything back.
