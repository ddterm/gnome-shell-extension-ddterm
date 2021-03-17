# Another Drop Down Terminal Extension for GNOME Shell

[extensions.gnome.org]

<img src="docs/screenshot.png" />

Inspired by

- https://github.com/bigbn/drop-down-terminal-x

- https://github.com/Guake/guake

## Distinguishing features

- Runs on Wayland natively

- Terminal window can be resized by dragging the border with mouse

- `Preferences` window with a lot of different settings

<img src="docs/prefs.gif" />

## Installing

The easiest way to install the extension is to go to [extensions.gnome.org].

However, review process on [extensions.gnome.org] is kinda slow, so a new
release may be available here on GitHub, but not on [extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

If you want to install from GitHub:

### Install from a prebuilt package

You can download a released version from
[Releases](https://github.com/amezin/gnome-shell-extension-ddterm/releases)
page. You need the file `ddterm@amezin.github.com.shell-extension.zip`.

Or, you can download a prebuilt package for a branch from
[Github Pages](https://amezin.github.io/gnome-shell-extension-ddterm/#prebuilt-extension-packages).

Download it, then run:

    $ gnome-extensions install -f /path/to/ddterm@amezin.github.com.shell-extension.zip

#### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

#### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ gnome-extensions enable ddterm@amezin.github.com

### Install from `git` repository

#### Dependencies

For installation from `git` repository, you should have build dependencies
installed:

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`gtk4-devel` package on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

`gtk4-build-tool` and `xsltproc` are only necessary if you want Gtk 4/GNOME 40
support. To build without them, run `make` with `WITH_GTK4=no`:
`make WITH_GTK4=no develop` or `make WITH_GTK4=no install`.

#### `make install`

`git clone` the repository into arbitrary location, and run `make install`:

    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ make install

It will build the extension package and install it.

##### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

##### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.

#### `make develop`

You can simply symlink the repository into extensions directory. `make develop`
will do it for you:

    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ make develop

##### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

##### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.

#### `git clone` to `~/.local/share/gnome-shell/extensions`

Or you can `clone` the repository directly into `~/.local/share/gnome-shell/extensions`:

    $ mkdir -p ~/.local/share/gnome-shell/extensions
    $ cd ~/.local/share/gnome-shell/extensions
    $ git clone https://github.com/amezin/gnome-shell-extension-ddterm.git ddterm@amezin.github.com
    $ cd ddterm@amezin.github.com
    $ make develop

Running `make develop` is still necessary to generate some files.

##### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

##### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.
