<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

ddterm GNOME Shell extension
============================

Shell extension source code is located in [`ddterm/shell`] subdirectory. It's
loaded by [`extension.js` file in the top-level directory].

[`ddterm/shell`]: /ddterm/shell
[`extension.js` file in the top-level directory]: /extension.js

Shell extension is responsible for:

* Positioning and resizing the window.

* Animating the window.

* Handling "global" keyboard shortcuts (i. e. shortcuts that work without the
application window).

* Launching the [ddterm application].

* Installing/uninstalling [`.desktop`] and [`.service`] files.

[ddterm application]: /ddterm/app
[`.desktop`]: /data/com.github.amezin.ddterm.desktop.in.in
[`.service`]: /data/com.github.amezin.ddterm.service.in

The extension exports a simple D-Bus interface
(see [`com.github.amezin.ddterm.Extension.xml`]) on GNOME Shell well-known name
`org.gnome.Shell`, path `/org/gnome/Shell/Extensions/ddterm`.

[`com.github.amezin.ddterm.Extension.xml`]: /data/com.github.amezin.ddterm.Extension.xml

Currently, extension code consists of multiple modules:

* [`extension.js`][]: the main entry point.

[`extension.js`]: /ddterm/shell/extension.js

* [`dbusapi.js`][]: D-Bus API skeleton.

[`dbusapi.js`]: /ddterm/shell/dbusapi.js

* [`appcontrol.js`][]: high-level actions: show/activate the application,
hide, show preferences. Interacts with the application through applications'
exported `GAction`s.

[`appcontrol.js`]: /ddterm/shell/appcontrol.js

* [`service.js`][]: starts ddterm application as a D-Bus service, if necessary.

[`service.js`]: /ddterm/shell/service.js

* [`subprocess.js`][]: a running ddterm application subprocess,
with the corresponding `Meta.WaylandClient`.

[`subprocess.js`]: /ddterm/shell/subprocess.js

* [`windowmatch.js`][]: monitors opened windows and finds ddterm's main window.

[`windowmatch.js`]: /ddterm/shell/windowmatch.js

* [`wlclipboard.js`][]: detects [wl-clipboard] utilities windows and implements
workarounds for them.

[wl-clipboard]: https://github.com/bugaevc/wl-clipboard
[`wlclipboard.js`]: /ddterm/shell/wlclipboard.js

* [`geometry.js`][]: computes expected window position and size.

[`geometry.js`]: /ddterm/shell/geometry.js

* [`animation.js`][]: computes expected animation parameters
and overrides window animations.

[`animation.js`]: /ddterm/shell/animation.js

* [`wm.js`][]: window manager code. Applies the correct window geometry
(computed by [`geometry.js`]) and animations (through [`animation.js`]).

[`wm.js`]: /ddterm/shell/wm.js

* [`panelicon.js`][]: ddterm's panel icon implementation.

[`panelicon.js`]: /ddterm/shell/panelicon.js

* [`notifications.js`][]: various notifications shown by ddterm.

[`notifications.js`]: /ddterm/shell/notifications.js

* [`install.js`][]: installation of [`.desktop`] and D-Bus [`.service`] files
for the application

[`install.js`]: /ddterm/shell/install.js

There are also utility modules:

* [`sd_journal.js`][]: connection to systemd-journald

[`sd_journal.js`]: /ddterm/shell/sd_journal.js

Extension code doesn't (and shouldn't) use any third party (npm) libraries.
