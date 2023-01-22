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

It may import modules from [`rx`] and [`pref`] directories.

Application code heavily relies on [RxJS], and also uses [Handlebars]
for tab titles.

[`ddterm/app`]: /ddterm/app
[`com.github.amezin.ddterm`]: /com.github.amezin.ddterm
[shell extension]: /ddterm/shell

[`rx`]: /ddterm/rx
[`pref`]: /ddterm/pref

[RxJS]: https://rxjs.dev/
[Handlebars]: https://handlebarsjs.com/

[`com.github.amezin.ddterm.Extension.xml`]: /ddterm/com.github.amezin.ddterm.Extension.xml
