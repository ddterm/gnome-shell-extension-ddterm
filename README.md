<!--
SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Another Drop Down Terminal Extension for GNOME Shell

[![extensions.gnome.org badge]][extensions.gnome.org]
[![AUR badge]][AUR link]
[![Dev build badge]][Dev build download link]
[![Weblate status badge]][Weblate]

![Drop down animation]

[extensions.gnome.org badge]: https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fextensions.gnome.org%2Fextension%2F3780%2Fddterm%2F&search=(%5Cd%2B)%20downloads&logo=gnome&label=extensions.gnome.org
[AUR badge]: https://img.shields.io/aur/version/gnome-shell-extension-ddterm?logo=archlinux
[AUR link]: https://aur.archlinux.org/packages/gnome-shell-extension-ddterm
[Dev build badge]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fddterm%2Fgnome-shell-extension-ddterm%2Fdeployments%3Fenvironment%3Dgithub-pages%26per_page%3D1&query=0.updated_at&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMTZweCIgdmlld0JveD0iMCAwIDE2IDE2IiB3aWR0aD0iMTZweCI%2BPHBhdGggZD0ibSAxNiA4LjAzMTI1IGMgMC4wMTU2MjUgLTAuNTIzNDM4IC0wLjM4NjcxOSAtMS4wMzEyNSAtMSAtMS4wMzEyNSBoIC0zIHYgLTUgYyAwIC0wLjgzMjAzMSAtMC41NjI1IC0xLjUyMzQzOCAtMS4wNTQ2ODggLTEuNzY5NTMxIGMgLTAuNDg4MjgxIC0wLjI0NjA5NCAtMC45NDUzMTIgLTAuMjMwNDY5IC0wLjk0NTMxMiAtMC4yMzA0NjkgaCAtNCBzIC0wLjQ1NzAzMSAtMC4wMTU2MjUgLTAuOTQ5MjE5IDAuMjMwNDY5IGMgLTAuNDg4MjgxIDAuMjQ2MDkzIC0xLjA1MDc4MSAwLjkzNzUgLTEuMDUwNzgxIDEuNzY5NTMxIHYgNSBoIC0zIGMgLTAuNjEzMjgxIDAgLTEuMDE1NjI1IDAuNTA3ODEyIC0xLjAwMzkwNjI1IDEuMDMxMjUgYyAwLjAwNzgxMjUgMC4yMzgyODEgMC4xMDE1NjI0NSAwLjQ4MDQ2OSAwLjI5Njg3NTI1IDAuNjc1NzgxIGwgNiA2IGMgMC4wMjczNDMgMC4wMjczNDQgMC4wNTQ2ODcgMC4wNTA3ODEgMC4wODU5MzcgMC4wNzQyMTkgYyAwLjQ3MjY1NiAwLjM3NSAxLjA0Njg3NSAwLjU1ODU5NCAxLjYyMTA5NCAwLjU1ODU5NCBzIDEuMTQ4NDM4IC0wLjE4MzU5NCAxLjYyMTA5NCAtMC41NTg1OTQgYyAwLjAzMTI1IC0wLjAyMzQzOCAwLjA1ODU5NCAtMC4wNDY4NzUgMC4wODU5MzcgLTAuMDc0MjE5IGwgNiAtNiBjIDAuMTk1MzEzIC0wLjE5NTMxMiAwLjI4OTA2MyAtMC40Mzc1IDAuMjkyOTY5IC0wLjY3NTc4MSB6IG0gLTMgMC45MTQwNjIgYyAtMS42MDE1NjIgMS40Njg3NSAtMyAyLjc2NTYyNiAtNC42MzI4MTIgNC4yNjk1MzIgYyAtMC4xNTIzNDQgMC4xMjEwOTQgLTAuMjYxNzE5IDAuMTc1NzgxIC0wLjM2NzE4OCAwLjE3OTY4NyBjIC0wLjEwNTQ2OSAtMC4wMDM5MDYgLTAuMjE0ODQ0IC0wLjA1ODU5MyAtMC4zNzEwOTQgLTAuMTc5Njg3IGMgLTEuNjI4OTA2IC0xLjUwMzkwNiAtMy4wMjczNDQgLTIuODAwNzgyIC00LjYyODkwNiAtNC4yNjk1MzIgbCAyIDAuMDU0Njg4IGggMSB2IC03IGggNCB2IDcgaCAxIHogbSAwIDAiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4K&label=dev%20build
[Dev build download link]: https://ddterm.github.io/gnome-shell-extension-ddterm/ddterm@amezin.github.com.shell-extension.zip
[Weblate status badge]: https://img.shields.io/weblate/progress/gnome-shell-extension-ddterm?logo=weblate

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
