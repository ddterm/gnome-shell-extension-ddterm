<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Architecture

ddterm consists of three components:

* [GNOME Shell extension], loaded into and running inside of GNOME Shell process.

* [GJS/Gtk application], running as a separate process.

* [Preferences dialog], loaded by both application and extension.

[GNOME Shell extension]: ../ddterm/shell
[GJS/Gtk application]: ../ddterm/app
[Preferences dialog]: ../ddterm/pref
