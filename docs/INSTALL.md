The easiest way to install the extension is to go to [extensions.gnome.org].

However, review process on [extensions.gnome.org] is kinda slow, so a new
release may be available here on GitHub, but not on [extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

# Install from a prebuilt package

You can download a released version from
[Releases](https://github.com/ddterm/gnome-shell-extension-ddterm/releases)
page. You need the file `ddterm@amezin.github.com.shell-extension.zip`.

Download it, then run:

    $ gnome-extensions install -f /path/to/ddterm@amezin.github.com.shell-extension.zip

## Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

## Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ gnome-extensions enable ddterm@amezin.github.com

# Install from `git` repository

## Dependencies

For installation from `git` repository, you should have build dependencies
installed:

- `npm` and, thus, node.js.

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`gtk4-devel` package on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

`gtk4-build-tool` and `xsltproc` are only necessary if you want Gtk 4/GNOME 40
support. To build without them, run `make` with `WITH_GTK4=no`:
`make WITH_GTK4=no develop` or `make WITH_GTK4=no install`.

Or, if you have `docker` installed instead, you can run:

    $ ./do-in-docker.sh make

This will generate all necessary files, using CI image, and then
`make install`/`make develop` won't need any dependencies.

## `make install`

`git clone` the repository into arbitrary location, run `npm install` to
download dependencies, and run `make install`:

    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ npm install
    $ make install

It will build the extension package and install it.

### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.

## `make develop`

You can simply symlink the repository into extensions directory. `make develop`
will do it for you:

    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ npm install
    $ make develop

### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.

## `git clone` to `~/.local/share/gnome-shell/extensions`

Or you can `clone` the repository directly into `~/.local/share/gnome-shell/extensions`:

    $ mkdir -p ~/.local/share/gnome-shell/extensions
    $ cd ~/.local/share/gnome-shell/extensions
    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git ddterm@amezin.github.com
    $ cd ddterm@amezin.github.com
    $ npm install
    $ make develop

Running `make develop` is still necessary to generate some files.

### Restart GNOME Shell

After that, restart GNOME Shell - log out, log in back. On X11 you can restart
the shell by pressing <kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

### Enable extension

Then you can enable the extension using `gnome-tweaks` app, or by running:

    $ make enable

in the repository.
