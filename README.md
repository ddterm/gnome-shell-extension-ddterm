<!--
SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Another Drop Down Terminal Extension for GNOME Shell

[![extensions.gnome.org badge]][extensions.gnome.org]
[![Dev build badge]][Dev build download link]
[![Weblate status badge]][Weblate]
[![Weblate languages badge]][Weblate]

![Drop down animation]

[extensions.gnome.org badge]: https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fextensions.gnome.org%2Fextension%2F3780%2Fddterm%2F&search=(%5Cd%2B)%20downloads&logo=gnome&label=extensions.gnome.org
[Dev build badge]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fddterm%2Fgnome-shell-extension-ddterm%2Fdeployments%3Fenvironment%3Dgithub-pages%26per_page%3D1&query=0.updated_at&label=development%20build
[Dev build download link]: https://ddterm.github.io/gnome-shell-extension-ddterm/ddterm@amezin.github.com.shell-extension.zip
[Weblate status badge]: https://hosted.weblate.org/widget/gnome-shell-extension-ddterm/svg-badge.svg
[Weblate languages badge]: https://hosted.weblate.org/widget/gnome-shell-extension-ddterm/language-badge.svg
[Drop down animation]: /docs/screenshots/dropdown.gif

Inspired by

- <https://github.com/bigbn/drop-down-terminal-x>

- <https://github.com/Guake/guake>

## Distinguishing features

- Runs on Wayland natively

- Can be controlled from the [command line]

- Terminal window can be resized by dragging the border with mouse

- All tabs are restored automatically after restart

- `Preferences` window with a lot of different settings

![Preferences screenshots]

[command line]: /docs/CommandLine.md
[Preferences screenshots]: /docs/screenshots/prefs.gif

## Review by [TechHut]

[![my favorite GNOME extension video thumbnail]][my favorite GNOME extension video]

[TechHut]: https://www.youtube.com/channel/UCjSEJkpGbcZhvo0lr-44X_w
[my favorite GNOME extension video]: http://www.youtube.com/watch?v=tF6_FJYca64
[my favorite GNOME extension video thumbnail]: http://img.youtube.com/vi/tF6_FJYca64/0.jpg

## Installing

The easiest way to install the extension is to go to [extensions.gnome.org].

However, the review process on [extensions.gnome.org] is sometimes slow.
A new release may be available here on GitHub, but not on
[extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

If you want to install from GitHub: see [`docs/Install.md`].

[`docs/Install.md`]: /docs/Install.md

## Contribute

Pull requests are always welcome.

See [`docs/CONTRIBUTING.md`].

[`docs/CONTRIBUTING.md`]: /docs/CONTRIBUTING.md

## Translations

You could help translating the user interface using [Weblate],
or by submitting translation improvements as pull requests on GitHub.

[![Translation status]][Weblate]

See [`docs/Translations.md`].

[Weblate]: https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/
[Translation status]: https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/multi-auto.svg
[`docs/Translations.md`]: /docs/Translations.md
