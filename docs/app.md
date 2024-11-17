<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

ddterm Gtk Application
----------------------

ddterm application code is located in [`ddterm/app`] subdirectory. Usually it's
launched through [`com.github.amezin.ddterm`] script from the top-level
directory by the [shell extension].

It's a Gtk 3 application - a simple Vte-based terminal emulator written in
GJS. A regular Gtk application, except:

* It communicates with the extension, using extension's D-Bus API
(see [`com.github.amezin.ddterm.Extension.xml`]).

* Its main window has no frame.

* On Wayland, the extension launches the app as a special, privileged client.

[`ddterm/app`]: /ddterm/app
[`com.github.amezin.ddterm`]: /com.github.amezin.ddterm
[shell extension]: /ddterm/shell

[`pref`]: /ddterm/pref

[`com.github.amezin.ddterm.Extension.xml`]: /ddterm/com.github.amezin.ddterm.Extension.xml
