ddterm GNOME Shell extension
----------------------------

Shell extension source code is located in [`ddterm/shell`] subdirectory. It's
loaded by [`extension.js`](/extension.js) file in the top-level directory.

Shell extension is responsible for:

* Positioning and resizing the window.

* Animating the window.

* Handling "global" keyboard shortcuts (i. e. shortcuts that work without the
application window).

* Launching the [ddterm application](/ddterm/app).

* Installing/uninstalling [`.desktop`](/ddterm/com.github.amezin.ddterm.desktop.in)
and [`.service`](/ddterm/com.github.amezin.ddterm.service.in) files.

The extension exports a simple D-Bus interface
(see [`com.github.amezin.ddterm.Extension.xml`]) on GNOME Shell well-known name
`org.gnome.Shell`, path `/org/gnome/Shell/Extensions/ddterm`.

Currently, extension code consists of multiple modules:

* [`extension.js`](/ddterm/shell/extension.js): the main entry point

* [`dbusapi.js`](/ddterm/shell/dbusapi.js): D-Bus API skeleton

* [`service.js`](/ddterm/shell/service.js): starts ddterm application as a
D-Bus service, if necessary

* [`subprocess.js`](/ddterm/shell/subprocess.js): a running ddterm application
subprocess, with the corresponding `Meta.WaylandClient`

* [`windowmatch.js`](/ddterm/shell/windowmatch.js): monitors opened windows and
finds ddterm's main window

* [`wm.js`](/ddterm/shell/wm.js): window management code

* [`panelicon.js`](/ddterm/shell/panelicon.js): ddterm's panel icon implementation

* [`install.js`](/ddterm/shell/install.js): installation of `.desktop` and
D-Bus `.service` files for the application

There are also utility modules:

* [`connectionset.js`](/ddterm/shell/connectionset.js): semi-automatic signal disconnection

* [`sd_journal.js`](/ddterm/shell/sd_journal.js): connection to systemd-journald

Extension code doesn't (and shouldn't) use any third party (npm) libraries.

[`ddterm/shell`]: /ddterm/shell
[`com.github.amezin.ddterm.Extension.xml`]: /ddterm/com.github.amezin.ddterm.Extension.xml
