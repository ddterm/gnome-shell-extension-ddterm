# Architecture

ddterm consists of three components:

* [GNOME Shell extension], loaded into and running inside of GNOME Shell process.

* [GJS/Gtk application], running as a separate process.

* [Preferences dialog], loaded by both application and extension.

There is also some [shared utility code].

[GNOME Shell extension]: /ddterm/shell
[GJS/Gtk application]: /ddterm/app
[Preferences dialog]: /ddterm/pref
[shared utility code]: /ddterm/common
