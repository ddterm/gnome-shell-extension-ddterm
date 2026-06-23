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

## [Unreleased]

### Added

### Changed

### Removed

### Fixed

- Moved dark mode setting to "Window" page in preferences dialog: [#2027].

[#2027]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/2027

[Unreleased]: https://github.com/ddterm/gnome-shell-extension-ddterm/compare/v63.2.1...HEAD

## [63.2.1] - 2026-06-22

### Fixed

- Potential failure in desktop entry and D-Bus service file installation:
[#1984].
- Transparent tab bar with custom themes: [#1997], [#2003], [#2000].
- Potential crash fix when splitting a pane containing only one tab
by [@van-riper]: [#1991].
- Chinese translation improvements by [@flytothehighest]: [#1987].
- Spanish translation improvements by [Libre]: [#1996].
- Korean translation improvements by [@seuimi]: [#2002], [#2013].

[#1984]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1984
[#1987]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1987
[#1991]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1991
[#1996]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1996
[#1997]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1997
[#2000]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/2000
[#2002]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/2002
[#2003]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/2003
[#2013]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/2013

[@flytothehighest]: https://github.com/flytothehighest
[@van-riper]: https://github.com/van-riper
[@seuimi]: https://github.com/seuimi
[Libre]: https://hosted.weblate.org/user/Libertad/

[63.2.1]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.2.1

## [63.2.0] - 2026-06-10

### Added

- "Work Area Size" setting: [#129], [#1978]. Reduces terminal width in
top/bottom window position, or height in left/right position.
- CSS id `#ddterm-window` to the main window: [#1979]. Can be used to apply
custom style to ddterm from `~/.config/gtk-3.0/gtk.css`.

### Fixed

- Replaced blocking i/o with async i/o in shell extension code:
[#1954], [#1972], [#1973], [#1974].
- Chinese translation improvements by [@flytothehighest]: [#1982].

[#129]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/129
[#1954]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1954
[#1972]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1972
[#1973]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1973
[#1974]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1974
[#1978]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1978
[#1979]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1979
[#1982]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1982

[63.2.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.2.0

## [63.1.1] - 2026-06-07

### Fixed

- Window placement on Mutter 50.2: [#1955].
- Prevent blocking on `/proc/${pid}/cmdline` read in wl-clipboard integration:
[#1954], [#1958], [#1959], [#1960].
- Spanish translation improvements by [Libre]: [#1965].

[#1955]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1955
[#1958]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1958
[#1959]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1959
[#1960]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1960
[#1965]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1965

[63.1.1]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.1.1

## [63.1.0] - 2026-06-02

### Added

- Added `Copy` and `Paste` hardware keys as default terminal copy/paste shortcuts
by [@ponta0]: [#1915].
- Added "Reset to default value" button for most settings in Preferences dialog:
[#1919], [#1947].
- Multiple shortcuts can be assigned to the same action through Preferences
dialog: [#932], [#1918].
- `xsltproc` is a build dependency again.

### Fixed

- Chinese translation updates by [@mikelei8291] and [@flytothehighest]:
[#1925], [#1945].
- German translation updates by [@Luca0208]: [#1937].
- Korean translation updates by [@seuimi]: [#1937].
- French translation fix by [@liuxiaopai-ai]: [#1744].
- When multiple keyboard shortcuts are assigned to the same action,
they are now better visually separated in Preferences dialog: [#1917].

[#932]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/932
[#1744]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1744
[#1915]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1915
[#1917]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1917
[#1918]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1918
[#1919]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1919
[#1925]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1925
[#1937]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1937
[#1945]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1945
[#1947]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1947

[@liuxiaopai-ai]: https://github.com/liuxiaopai-ai
[@Luca0208]: https://github.com/Luca0208
[@mikelei8291]: https://github.com/mikelei8291
[@ponta0]: https://github.com/ponta0

[63.1.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.1.0

## [63.0.1] - 2026-05-10

### Added

- Releases will now include source code tarballs with subprojects [#1880].

### Fixed

- Renamed settings schema to comply with GNOME Shell extension guidelines:
[#1888].
- Fix for Korean translation by [@seuimi]: [#1885], [#1886].
- Esperanto translation updates by [phlostically]: [#1886].
- Restored cyclic navigation between tabs/pages: [#1898], [#1901].

[#1880]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1880
[#1885]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1885
[#1886]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1886
[#1888]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1888
[#1898]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1898
[#1901]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1901

[phlostically]: https://hosted.weblate.org/user/phlostically/

[63.0.1]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.0.1

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

[@yuhldr]: https://github.com/yuhldr

### Changed

- "Preferences" dialog now uses libhandy (`HdyPreferences*`) on Gtk 3: [#1567],
  [#1568].
- Tab title editor is now a simple dialog, not popover: [#1667].
- `Gtk.Notebook` is replaced with `Handy.TabView` and `Handy.TabBar`: [#1766].
- By default, ddterm will now autohide when losing focus: [#1712].
- Most of application's UI is now created by `GtkBuilder`: [#1774].
- Dependency installation is now handled by a subproject: [#1587].

[#1567]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1567
[#1568]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1568
[#1587]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1587
[#1667]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1667
[#1712]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1712
[#1766]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1766
[#1774]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1774

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
- German translation updates by [@daPhipz]: [#1585].
- Spanish translation updates by [@cyphra]: [#1590], [#1758].
- French translation updates by [@leducvin]: [#1854].
- Italian translation updates by [Traduttore]: [#1798], [#1813].
- Chinese translation updates: [#1792] by [@yuhldr], [#1781] by [Mike Lei],
  [#1768] by [@flytothehighest].

[#1585]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1585
[#1590]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1590
[#1758]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1758
[#1768]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1768
[#1781]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1781
[#1792]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1792
[#1798]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1798
[#1813]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1813
[#1854]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1854

[@cyphra]: https://github.com/cyphra
[@daPhipz]: https://github.com/daPhipz
[@leducvin]: https://github.com/leducvin
[Mike Lei]: https://hosted.weblate.org/user/mikelei/
[Traduttore]: https://hosted.weblate.org/user/traaduttore/

[63.0.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v63.0.0

## [62.0.2] - 2025-10-13

### Changed

- Improved symbolic icon: [#1524].
- Switched to GNOME Shell D-Bus API for getting the extension version: [#1515].

[#1515]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1515
[#1524]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1524

### Removed

- Unused `stylesheet.css` file: [#1512].

[#1512]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1512

### Fixed

- Fixed Vte package (auto)installation on openSUSE: [#1541].
- Improved stability of mouse resizing test: [#1507].
- Turkish translation update by [@enatsek]: [#1533].

[#1507]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1507
[#1533]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1533
[#1541]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1541

[@enatsek]: https://github.com/enatsek

[62.0.2]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.2

## [62.0.1] - 2025-09-24

### Fixed

- Startup failure when the package is installed from extensions.gnome.org:
  [#1505], [#1506].

[#1505]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/1505
[#1506]: https://github.com/ddterm/gnome-shell-extension-ddterm/pull/1506

[62.0.1]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.1

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

### Fixed

- Multiple minor bug fixes.
- Translation updates by [@thenameisluk], [@vantu5z], [@yuhldr], [@Atalanttore].

[@thenameisluk]: https://github.com/thenameisluk
[@vantu5z]: https://github.com/vantu5z
[@Atalanttore]: https://github.com/Atalanttore

[62.0.0]: https://github.com/ddterm/gnome-shell-extension-ddterm/releases/tag/v62.0.0

<!-- markdownlint-configure-file {
    "no-duplicate-heading": { "siblings_only": true }
} -->
