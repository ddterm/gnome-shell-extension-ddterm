<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Contributing to the project

## Reporting bugs

If you want to report a bug, please proceed to the [bug reporting form].

> [!NOTE]
> Unexpected error messages, warnings in logs are bugs. Something not working
> as documented or as labeled in the UI is a bug. But lack of a menu option,
> lack of a keyboard shortcut, lack of a checkbox in the settings dialog
> is not a bug. If you want something added, it's a feature request.
> "Lack of a feature" is not a bug.

[bug reporting form]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/new?labels=bug&template=BUG.yml

## Writing code

> [!IMPORTANT]
> Pull requests are preferred to feature requests :)

> [!IMPORTANT]
> When you add or modify any file, except translations, please add either:
>
> a) `SPDX-FileContributor` tag with your name:
> `SPDX-FileContributor: Your Name <e-mail@address>` (e-mail part is optional)
>
> b) [`SPDX-FileCopyrightText`] tag with your name:
> `SPDX-FileCopyrightText: YEAR Your Name <e-mail@address>` (e-mail part is optional)
>
> [`SPDX-FileCopyrightText`] should be used for large, significant changes. See:
> <https://www.gnu.org/prep/maintain/html_node/Legally-Significant.html>. Quote:
> "A change of just a few lines (less than 15 or so) is not legally significant
> for copyright".

[`SPDX-FileCopyrightText`]: https://reuse.software/faq/

> [!IMPORTANT]
> If you want to be mentioned in application's "About" dialog,
> you could also add yourself to the [`AUTHORS`] file.

[`AUTHORS`]: /AUTHORS

If you want to implement a feature, or fix a bug, you may find these documents
useful:

* [How to build and install the project from source][Build.md]

* [Brief architecture description][Architecture.md]

* [Manual testing/debugging][Debug.md]

* [Automated tests][Test.md]

* [Debugging/testing on multiple distros using Vagrant][Vagrant.md]

TODO: add more

[Build.md]: /docs/Build.md
[Architecture.md]: /docs/Architecture.md
[Debug.md]: /docs/Debug.md
[Test.md]: /docs/Test.md
[Vagrant.md]: /docs/Vagrant.md

> [!IMPORTANT]
> ddterm is published on [extensions.gnome.org], so its code must adhere to
> [GNOME Shell Extensions Review Guidelines].

[GNOME Shell Extensions Review Guidelines]: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

> [!TIP]
> The [Gtk application] part of ddterm should be considered a ["script"].
> It does not have to follow all rules for extension code (for example, static
> initialization is allowed, as there is no `.enable()` and `.disable()`).

["script"]: https://gjs.guide/extensions/review-guidelines/review-guidelines.html#scripts-and-binaries
[Gtk application]: /ddterm/app

## Translating

You could also help [translating the user interface][Translations.md].

[Translations.md]: /docs/Translations.md

[![Translation status]][Weblate]

[Weblate]: https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/
[Translation status]: https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/287x66-white.png
