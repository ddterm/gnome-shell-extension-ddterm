# Another Drop Down Terminal Extension for GNOME Shell

Inspired by

- https://github.com/bigbn/drop-down-terminal-x

- https://github.com/Guake/guake

## Distinguishing features

- Works on Wayland correctly, without XWayland

- Terminal window can be resized by dragging the border with mouse

- Using modern Gtk APIs (GAction, GMenu)

- The extension itself is very small

Currently, there are many missing features (mostly - VTE properties that should
be configurable through Preferences dialog). However, it is already usable.

## Installing

Currently, the only available installation method is `git`, there are no
released versions yet.

    $ mkdir -p ~/.local/gnome-shell/extensions
    $ cd ~/.local/gnome-shell/extensions
    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git ddterm@amezin.github.com
    $ cd ddterm@amezin.github.com
    $ make schemas/gschemas.compiled

Or you can `clone` the repository into arbitrary location, and run `make install`:

    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ make install
