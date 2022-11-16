# Architecture

ddterm consists of two components:

* GNOME Shell extension, loaded into and running inside of GNOME Shell process.

* GJS/Gtk application, running as a separate process.

## GNOME Shell extension

Shell extension is responsible for:

* Positioning and resizing the window.

* Animating the window.

* Handling "global" keyboard shortcuts (i. e. shortcuts that work without the
application window).

The extension exports a simple D-Bus interface
(see [`com.github.amezin.ddterm.Extension.xml`]) on GNOME Shell well-known name
`org.gnome.Shell`, path `/org/gnome/Shell/Extensions/ddterm`.

Currently, extension code consists of two modules: [`extension.js`] and
[`wm.js`], and doesn't use any external (npm) libraries.

## Gtk application

A simple terminal emulator, written in GJS. A regular Gtk application, except:

* It communicates with the extension, using extension's D-Bus API.

* Its main window has no frame.

* On Wayland, the extension launches the app as a special, privileged client.

Application code heavily relies on [RxJS], and also uses [Handlebars]
for tab titles.

`rxutil.js` is an integration layer between GObject/Gtk and RxJS.

## Preferences dialog

Preferences dialog is shared between the application and the extension. Even
though [`prefs.js`] is considered part of the extension, it isn't loaded into
the main GNOME Shell process, so it's more similar to the application code and
also uses [RxJS].

[RxJS]: https://rxjs.dev/
[Handlebars]: https://handlebarsjs.com/

[`com.github.amezin.ddterm.Extension.xml`]: ../com.github.amezin.ddterm.Extension.xml
[`extension.js`]: ../extension.js
[`wm.js`]: ../wm.js
[`rxutil.js`]: ../rxutil.js
[`prefs.js`]: ../prefs.js
