ddterm Preferences Dialog
-------------------------

"Preferences" dialog implementation is located in [`ddterm/pref`] directory.

It can be loaded (imported) by both the [application] and the
[shell extension] (through [`prefs.js`] in the top-level directory).

Code of this component must support both Gtk 3 and Gtk 4.

[`test`] directory contains a few scripts that enable manual testing of the
dialog without installation:

* [`gtk3.js`] - launch Gtk 3 version of the dialog.

* [`gtk4.js`] - launch Gtk 4 version of the dialog.

However, you'll have to run `make` before invoking these scripts - to generate
the required `*.ui` files.

[`ddterm/pref`]: /ddterm/pref
[application]: /ddterm/app
[shell extension]: /ddterm/shell
[`test`]: /ddterm/pref/test
[`gtk3.js`]: /ddterm/pref/test/gtk3.js
[`gtk4.js`]: /ddterm/pref/test/gtk4.js
[`prefs.js`]: /prefs.js
