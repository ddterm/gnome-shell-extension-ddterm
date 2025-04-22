<!--
SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Translations

You could help translating the user interface using Weblate, or by opening
a pull request on GitHub.

## [Weblate](https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/)

[![Translation status](https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/287x66-white.png)](https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/)

[![Translation status](https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/multi-auto.svg)](https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/)

## Other tools

CI system automatically adds new strings to `.pot` and `.po` files, using
`msgmerge` build target. There should be no need to run it manually.

You can add/edit a `.po` file with the tool of your choice and create a pull
request.

## Adding a new language

### Create a Pull Request

1. [Fork the repository](https://github.com/ddterm/gnome-shell-extension-ddterm/fork)

2. Clone your forked repository using `git`.

3. Create new translation `.po` file using `msginit`.

4. Add the language name to [`LINGUAS`](../po/LINGUAS) file.

5. Create a pull request.

Example for Hungarian (`hu`) translation:

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

If you're not familiar with Git/GitHub, you can
[open an issue](https://github.com/ddterm/gnome-shell-extension-ddterm/issues/new?template=FEATURE.md)
instead.
