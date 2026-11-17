# Steam login and downloads

The user's requested flow is a dedicated Steam login page and a separate
download page, styled after Steam. Keep the launcher navigation and compact
header; reclaim the launch dock's width while these pages are open.

The account flow uses cool blue Steam-like surfaces, a clear account/password
form, in-place email/Steam Guard/mobile confirmation states, and automatic
navigation to the owned resource library on successful authentication. Existing
SteamKit protocol and encrypted token storage remain responsible for login.
No unsupported QR login or external-page login is presented.

The resource library shows the actual account, entitlement, installed resource
state and the supported Linux/public resource branch. Download navigates
immediately to the dedicated download page. Progress comes from native snapshots;
the result remains visible after download, verification and installation finish.
The page supports cancellation, explicit retry, returning to the library and
opening installed resources. It never invents transfer speed or total size.

A provider above page content owns the pending request and last result so
switching launcher pages does not discard progress, errors or completion.
This is current-session state, not persistent download history. Existing
downloads do not gain pause/resume or process-death restoration.

Native workspace routes use the existing Animate UI PageTransition, compact
back navigation and Android Back dispatch. Keyboard/reduced-motion behavior is
inherited from the launcher. The login is split horizontally on landscape phones
and stacked on portrait phones. Passwords and Guard codes are cleared after
submission and never placed in URLs or persisted in UI state.

Verification covers native bridge fixtures for Guard, reconnection, ownership,
page transitions, six viewport sizes, keyboard viewport, task navigation,
cancellation, failure/retry and completion. Real-device inspection uses the
existing session without logging out or starting a paid-resource download.
