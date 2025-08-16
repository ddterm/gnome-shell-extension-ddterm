<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

ddterm Gtk Application
======================

ddterm application code is located in [`ddterm/app`] subdirectory. Usually it's
launched through [`com.github.amezin.ddterm`] script from the [`bin`] directory
by the [shell extension].

[`ddterm/app`]: /ddterm/app
[`com.github.amezin.ddterm`]: /bin/launcher.js
[`bin`]: /bin
[shell extension]: /ddterm/shell

It's a Gtk 3 application - a simple Vte-based terminal emulator written in
GJS. A regular Gtk application, except:

* It communicates with the extension, using extension's D-Bus API
(see [`com.github.amezin.ddterm.Extension.xml`]).

* Its main window has no frame.

* Unlike a regular Gtk app, it does not rely on D-Bus activation. Instead,
it calls extension's D-Bus API ([`com.github.amezin.ddterm.Extension.xml`])
to start the "service" instance.

* On Wayland, the extension launches the app as a special, privileged client.

* Also on Wayland, it synchronizes its window size with the extension's
expected window size before showing the window.

[`com.github.amezin.ddterm.Extension.xml`]: /data/com.github.amezin.ddterm.Extension.xml
