# tModLoader launcher theme

Add a fourth appearance choice, `tModLoader`, without changing the default or the existing light, dark, and system modes. It is a dark launcher skin, not a change to the game, mods, layout, or launch behavior.

Use `UICommon` and `UIPanel` in the local tModLoader source for the indigo palette and dark borders; use the game's `OurFavoriteColor` for focus and selection. TerraUI and Terraria Logo Maker are visual references only. Use a locally authored pixel wordmark for the English launcher brand and the existing readable font for Chinese text. No external UI runtime, fonts, or network assets are needed.

Scope styling to the chosen skin. Apply it to the launcher navigation, game management, mods, downloads, settings, modal and launch controls. Preserve custom backgrounds, preferences, safe areas, touch targets and keyboard navigation. Temporarily use opaque panels instead of liquid glass; switching away restores the stored material preference.

The existing preference record stores `tml` in both the browser and Android. Verify persistence, restoration of the existing themes and material, narrow and landscape layouts, theme styles in the native download workspace and APK packaging.
