ddterm GNOME Shell extension
----------------------------

Shell extension source code is located in [`ddterm/shell`] subdirectory. It's
loaded by [`extension.js`](/extension.js) file in the top-level directory.

Shell extension is responsible for:

* Positioning and resizing the window.

* Animating the window.

* Handling "global" keyboard shortcuts (i. e. shortcuts that work without the
application window).

The extension exports a simple D-Bus interface
(see [`com.github.amezin.ddterm.Extension.xml`]) on GNOME Shell well-known name
`org.gnome.Shell`, path `/org/gnome/Shell/Extensions/ddterm`.

Currently, extension code consists of multiple modules:

* [`extension.js`](/ddterm/shell/extension.js): the main entry point

* [`wm.js`](/ddterm/shell/wm.js): window management code

* [`panelicon.js`](/ddterm/shell/panelicon.js): ddterm's panel icon implementation

There is also a utility module:

* [`connectionset.js`](/ddterm/shell/connectionset.js): semi-automatic signal disconnection

Extension code doesn't (and shouldn't) use any third party (npm) libraries.

[`ddterm/shell`]: /ddterm/shell
[`com.github.amezin.ddterm.Extension.xml`]: /ddterm/com.github.amezin.ddterm.Extension.xml
