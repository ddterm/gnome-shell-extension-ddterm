<!--
SPDX-FileCopyrightText: 2026 ddterm contributors <https://github.com/ddterm/gnome-shell-extension-ddterm/>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog], and this project adheres to
[Semantic Versioning].

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html

## [63.0.0] - 2026-04-24

### Added

- GNOME 50 compatibility: [#1734], [#1853].
- "Copy on selection" feature by [@mikelei8291]: [#1778].
- Meson options `test_x11` and `test_wl_clipboard`: [#1601].
- Korean translation by [@seuimi]: [#1728], [#1731], [#1737], [#1762], [#1818].
- This changelog: [#1875].

[#1601]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1601
[#1728]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1728
[#1731]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1731
[#1737]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1737
[#1734]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1734
[#1762]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1762
[#1778]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1778
[#1818]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1818
[#1853]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1853
[#1875]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1875

[@mikelei8291]: https://github.com/mikelei8291
[@seuimi]: https://github.com/seuimi

### Changed

- "Preferences" dialog now uses libhandy (`HdyPreferences*`) on Gtk 3: [#1567],
  [#1568].
- Tab title editor is now a simple dialog, not popover: [#1667].
- `Gtk.Notebook` is replaced with `Handy.TabView` and `Handy.TabBar`: [#1766].
- By default, ddterm will now autohide when losing focus: [#1712].
- Most of application's UI is now created by `GtkBuilder`: [#1774].
- Dependency installation is now handled by a subproject: [#1587].
- German translation updates by [@daPhipz]: [#1585].
- Spanish translation updates by [@cyphra]: [#1590], [#1758].
- French translation updates by [@leducvin]: [#1854].
- Italian translation updates by [Traduttore]: [#1798], [#1813].
- Chinese translation updates: [#1792] by [@yuhldr], [#1781] by [Mike Lei],
  [#1768] by [@flytothehighest].

[#1567]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1567
[#1568]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1568
[#1585]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1585
[#1587]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1587
[#1590]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1590
[#1667]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1667
[#1712]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1712
[#1758]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1758
[#1766]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1766
[#1768]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1768
[#1774]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1774
[#1781]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1781
[#1792]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1792
[#1798]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1798
[#1813]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1813
[#1854]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1854

[@cyphra]: https://github.com/cyphra
[@daPhipz]: https://github.com/daPhipz
[@flytothehighest]: https://github.com/flytothehighest
[@leducvin]: https://github.com/leducvin
[Mike Lei]: https://hosted.weblate.org/user/mikelei/
[Traduttore]: https://hosted.weblate.org/user/traaduttore/

### Removed

- GNOME 45 support: [#1556], [#1650].
- Support for Vte versions before 0.76: [#1599].
- `gtk-builder-tool` and `Xvfb` build dependencies: [#1600].
- Compatibility with GLib versions before 2.80: [#1618].

[#1556]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1556
[#1599]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1599
[#1600]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1600
[#1618]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1618
[#1650]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1650

### Fixed

- Some memory leaks from GObject reference cycles.

## [62.0.2] - 2025-10-13

### Changed

- Improved symbolic icon: [#1524].
- Switched to GNOME Shell D-Bus API for getting the extension version: [#1515].
- Turkish translation update by [@enatsek]: [#1533].

[#1515]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1515
[#1524]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1524
[#1533]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1533

[@enatsek]: https://github.com/enatsek

### Removed

- Unused `stylesheet.css` file: [#1512].

[#1512]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1512

### Fixed

- Fixed Vte package (auto)installation on openSUSE: [#1541].
- Improved stability of mouse resizing test: [#1507].

[#1507]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1507
[#1541]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1541

## [62.0.1] - 2025-09-24

### Fixed

- Startup failure when the package is installed from extensions.gnome.org:
  [#1505], [#1506].

[#1505]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1505
[#1506]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1506

## [62.0.0] - 2025-09-24

### Added

- GNOME 49 support
- "About" dialog
- Icons by [@thenameisluk]: [#1285], [#1294].

[#1285]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1285
[#1294]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1294

### Changed

- Switched to Semantic Versioning.
- Refactoring to make Gtk 4 port easier (hopefully).
- Translation updates by [@thenameisluk], [@vantu5z], [@yuhldr], [@Atalanttore].

[@thenameisluk]: https://github.com/thenameisluk
[@vantu5z]: https://github.com/vantu5z
[@yuhldr]: https://github.com/yuhldr
[@Atalanttore]: https://github.com/Atalanttore

### Fixed

- Multiple minor bug fixes.

[63.0.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.0.0
[62.0.2]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.2
[62.0.1]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.1
[62.0.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.0

<!-- markdownlint-configure-file {
    "no-duplicate-heading": { "siblings_only": true }
} -->
