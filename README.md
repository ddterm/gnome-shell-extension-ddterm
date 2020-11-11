# Another Drop Down Terminal Extension for GNOME Shell

<img src="docs/screenshot.png" />

Inspired by

- https://github.com/bigbn/drop-down-terminal-x

- https://github.com/Guake/guake

## Distinguishing features

- Runs on Wayland natively

- Terminal window can be resized by dragging the border with mouse

- `Preferences` window with a lot of different settings

<img src="docs/prefs.gif" width="877" height="579" />

## Installing

### 1. Install the extension to `~/.local/share/gnome-shell/extensions`

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

Or you can `clone` the repository directly into `~/.local/share/gnome-shell/extensions`:

    $ mkdir -p ~/.local/share/gnome-shell/extensions
    $ cd ~/.local/share/gnome-shell/extensions
    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git ddterm@amezin.github.com
    $ cd ddterm@amezin.github.com
    $ make schemas/gschemas.compiled

### 2. Restart Gnome Shell

On Wayland you have to log out and log in back.

On X11, you can restart the shell by pressing `Alt+F2`, `r`, `Enter`

### 3. Enable the extension

Enable the extension using `gnome-tweaks`, or:

    $ make enable

in the cloned repository.
