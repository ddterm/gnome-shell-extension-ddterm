# Architecture

ddterm consists of three components:

* [GNOME Shell extension], loaded into and running inside of GNOME Shell process.

* [GJS/Gtk application], running as a separate process.

* [Preferences dialog], loaded by both application and extension.

There is also some [reactive/Rx utility code], used by the [GJS/Gtk application]
and [Preferences dialog].

[GNOME Shell extension]: /ddterm/shell
[GJS/Gtk application]: /ddterm/app
[Preferences dialog]: /ddterm/pref
[reactive/Rx utility code]: /ddterm/rx
