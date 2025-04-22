<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

ddterm GNOME Shell extension
============================

Shell extension source code is located in [`ddterm/shell`] subdirectory. It's
loaded by [`extension.js`](../../extension.js) file in the top-level directory.

Shell extension is responsible for:

* Positioning and resizing the window.

* Animating the window.

* Handling "global" keyboard shortcuts (i. e. shortcuts that work without the
application window).

* Launching the [ddterm application](../../ddterm/app).

* Installing/uninstalling [`.desktop`](../../data/com.github.amezin.ddterm.desktop.in.in)
and [`.service`](../../data/com.github.amezin.ddterm.service.in) files.

The extension exports a simple D-Bus interface
(see [`com.github.amezin.ddterm.Extension.xml`]) on GNOME Shell well-known name
`org.gnome.Shell`, path `/org/gnome/Shell/Extensions/ddterm`.

Currently, extension code consists of multiple modules:

* [`extension.js`](../../ddterm/shell/extension.js): the main entry point

* [`dbusapi.js`](../../ddterm/shell/dbusapi.js): D-Bus API skeleton

* [`appcontrol.js`](../../ddterm/shell/appcontrol.js): high-level actions:
show/activate the application, hide, show preferences. Interacts with the
application through applications' exported `GAction`s.

* [`service.js`](../../ddterm/shell/service.js): starts ddterm application as a
D-Bus service, if necessary

* [`subprocess.js`](../../ddterm/shell/subprocess.js): a running ddterm application
subprocess, with the corresponding `Meta.WaylandClient`

* [`windowmatch.js`](../../ddterm/shell/windowmatch.js): monitors opened windows
and finds ddterm's main window

* [`wlclipboard.js`](../../ddterm/shell/wlclipboard.js): detects [wl-clipboard]
utilities windows and implements workarounds for them.

* [`geometry.js`](../../ddterm/shell/geometry.js): computes window position and size

* [`wm.js`](../../ddterm/shell/wm.js): window management code

* [`panelicon.js`](../../ddterm/shell/panelicon.js): ddterm's panel icon implementation

* [`notifications.js`](../../ddterm/shell/notifications.js): notifications UI

* [`install.js`](../../ddterm/shell/install.js): installation of `.desktop` and
D-Bus `.service` files for the application

* [`packagemanager.js`](../../ddterm/shell/packagemanager.js): installation of
missing OS packages using PackageKit CLI (`pkcon`) or OS package manager
in an external terminal

There are also utility modules:

* [`sd_journal.js`](../../ddterm/shell/sd_journal.js): connection to systemd-journald

Extension code doesn't (and shouldn't) use any third party (npm) libraries.

[`ddterm/shell`]: ../../ddterm/shell
[`com.github.amezin.ddterm.Extension.xml`]: ../../data/com.github.amezin.ddterm.Extension.xml

[wl-clipboard]: https://github.com/bugaevc/wl-clipboard
