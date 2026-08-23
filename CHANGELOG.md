# Changelog

Semantic versioning: MAJOR = a prop, exported type, or default behaviour changed in a way that
could break an existing consumer without any code change on their side. MINOR = additive only.
Consuming projects should pin to a tag (`#v1.0.0`), never `#main`.

## v1.0.0 — 2026-08-23

First release. `ClaudiaNotificationBell` + `ClaudiaNotificationList`, ported from SafeSpaces'
real, live notification system (checked its actual current NotificationBell.tsx and
Notifications.tsx before building this, not guessed): real-time unread count, all/unread
filter, date-grouped list (Today/Yesterday/Earlier), mark-as-read (single + all, optimistic
with rollback on error), delete (single + clear-read + clear-all).

Date-grouping logic tested against 4 real edge cases -- including a month-boundary case that
would break naive `date - 1 day` arithmetic -- in a standalone script before any UI code was
written, matching the discipline used for `@jo51yon/claudia-calendar`'s date math.

`onClick`/`onNotificationClick` are dependency-injected, not hardcoded navigation:
SafeSpaces' version is tied to react-router; none of Claudia's real projects use it. Navigation
decisions stay with the caller.

Schema (`claudia_notifications`) proven correct with a real RLS test before any UI was built:
a genuinely simulated authenticated session for one user sees their own notification; a
different simulated user sees none of it -- verified as two separate real checks, not assumed
from one passing case.

**Known consumers at this tag:** none yet at release.
