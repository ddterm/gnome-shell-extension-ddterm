# Another Drop Down Terminal Extension for GNOME Shell

Inspired by

- https://github.com/bigbn/drop-down-terminal-x

- https://github.com/Guake/guake

## Distinguishing features

- Works in Wayland session correctly (but still requires xwayland)

- Terminal window can be resized by dragging the border with mouse

- Using modern Gtk APIs (GAction, GMenu)

- The extension itself is very small

Currently, there are many missing features (mostly - VTE properties that should
be configurable through Preferences dialog). However, it is already usable.

## Installing

`git clone` the repository into arbitrary location, and run `make install`:

    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ make install

It will build the extension package and install it.

Or you can simply symlink the repository into extensions directory.
`make develop` will do it:

    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ make develop

Or you can `clone` the repository directly into `~/.local/gnome-shell/extensions`:

    $ mkdir -p ~/.local/gnome-shell/extensions
    $ cd ~/.local/gnome-shell/extensions
    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git ddterm@amezin.github.com
    $ cd ddterm@amezin.github.com
    $ make schemas/gschemas.compiled
