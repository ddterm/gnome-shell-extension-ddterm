<!--
SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Translations

You can edit translations on [Weblate], or submit your changes as a pull request
on GitHub.

[Weblate]: https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/

> [!IMPORTANT]
> When working on a translation, please add your name
> to the translation of [`translator-credits`] string as a new line.
> You could also add an e-mail address (in `Name <email>` format),
> or a URL (in `Name https://url` format).

[`translator-credits`]: https://wiki.gnome.org/TranslationProject(2f)DevGuidelines(2f)Add(20)translator(20)credits.html

## [Weblate]

[![Translation status]][Weblate]

[![Translation status 2]][Weblate]

[Translation status]: https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/287x66-white.png
[Translation status 2]: https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/multi-auto.svg

## Other tools

CI system automatically adds new strings to `.pot` and `.po` files.

You can add/edit a `.po` file with the tool of your choice and create a pull
request.

## Adding a new language

Previously, people often added new languages through Weblate, but then left
the translations empty.

So the option to add languages on Weblate had been disabled.

New languages can only be added through GitHub.

### Create a Pull Request

1. [Fork the repository].

2. Clone your forked repository using `git`.

3. Create new translation `.po` file using `msginit`.

4. Add the language name to [`LINGUAS`] file.

5. Create a pull request.

[Fork the repository]: https://github.com/ddterm/gnome-shell-extension-ddterm/fork
[`LINGUAS`]: /po/LINGUAS

Example - steps 2 to 4 for Hungarian (`hu`) translation:

```sh
git clone git@github.com:yourname/gnome-shell-extension-ddterm.git
cd gnome-shell-extension-ddterm/po
msginit -i ddterm@amezin.github.com.pot -l hu --no-translator --no-wrap
echo hu >>LINGUAS
git add hu.po LINGUAS
git commit -m "translations: add Hungarian"
git push
```

### Create an Issue

If you're not familiar with Git/GitHub, you can [open an issue] instead of
a pull request.

[open an issue]: https://github.com/ddterm/gnome-shell-extension-ddterm/issues/new?template=FEATURE.md
