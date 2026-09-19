# Steam Content

The Android host uses SteamKit2 over its WebSocket protocol. It performs these
checks before downloading any Terraria depot:

1. Authenticate with Steam account credentials and Steam Guard when needed.
2. Reuse an Android Keystore-backed refresh-token session when available.
3. Query Steam PICS access tokens for Terraria App ID `105600`.
4. Stop if the signed-in account does not own Terraria.
5. Download public depot manifests and files through Steam CDN endpoints.
6. Verify chunk SHA-1 and complete-file SHA-1 before promoting files.

Downloads use `.downloading` temporary files and path validation. The target is
the app-private game directory, so the APK and Git repository remain free of
commercial Terraria content. A failed download is not marked complete.

The Steam password is method-local and is never serialized. The persisted
record contains only the account name, refresh token, and GuardData, encrypted
by an AES-GCM key held in Android Keystore. Clearing app data or deleting the
credential record removes the encrypted session and Keystore alias.

The downloader has not been tested with a real Steam account in this workspace.
That final step requires the user's device, account ownership, and Steam Guard.
