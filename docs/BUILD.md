# 1. Obtain the source code

## 1.a) Using `git`

    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git

## 1.b) Download as archive and unpack

GitHub UI provides multiple options for downloading the source code as a `.zip`
(or, sometimes, `.tar.gz`) archive - for releases, and arbitrary commits.

# 2. Working directory

`cd` into the source code directory. All the following commands should be run
there.

    $ cd gnome-shell-extension-ddterm

# 3. Setup the build environment

## 3.a) Install the necessary dependencies

To build the extension package, you should have the following tools installed:

- `make`

- `npm` and, thus, node.js.

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`gtk4-devel` package on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

- `msgcmp`, `msgmerge` (`gettext` package)

- `zip`

`gtk4-build-tool` and `xsltproc` are only necessary if you want Gtk 4/GNOME 40
support. To build without them, add `WITH_GTK4=no` argument every time you run
`make`.

## 3.b) Build in a container

Alternatively, you can use `docker` or `podman` to perform build steps in a
container - the same image/environment that's used by the CI system. To do it,
run build commands with `./do-in-docker.sh` or `./do-in-podman.sh` wrapper:

    $ ./do-in-docker.sh npm install
    $ ./do-in-docker.sh make pack

# 4. `npm install`

The extension needs two JavaScript libraries from npm: handlebars and rxjs.
`make` should automatically run `npm install` when necessary to download them.

However, you could also run `npm install` manually:

    $ npm install

If you want to build in a docker/podman container, prepend `./do-in-docker.sh`/
`./do-in-podman.sh`:

    $ ./do-in-docker.sh npm install

You can also append `--omit dev` to `npm install` to speed up the process:

    $ npm install --omit dev

In this case `npm` will not install development tools (currently only eslint).
They aren't necessary if your only intention is to build the package without
modifying the code.

If you've ran `npm install` manually, `make` won't try to run it again, until
`package.json` or `package-lock.json` changes. To disable automatic
`npm install` completely, pass `NPM_INSTALL=no` to `make`:

    $ make NPM_INSTALL=no ...

# 5. `make pack`

To build the package, run `make pack`:

    $ make pack

If you want to build in a docker/podman container, prepend `./do-in-docker.sh`/
`./do-in-podman.sh`:

    $ ./do-in-docker.sh make pack

You can also add `WITH_GTK4=no` to `make pack` to build the package without
Gtk 4/GNOME 40 support:

    $ make WITH_GTK4=no pack

It might be necessary if you want to build the package on an old distribution
without `gtk4-builder-tool`.

# 6. Install the package

The installation process is described in
[INSTALL.md - continue from step 2](INSTALL.md#2-install-the-package).

Alternatively, you could use `make` to install the package too.

## 6.1. `make install`

To install the package, run:

    $ make install

If you built the package without Gtk 4 support, you'd have to pass
`WITH_GTK4=no` here too:

    $ make WITH_GTK4=no install

You should never run `make install` with `./run-in-docker.sh` or
`./run-in-podman.sh`. You want the extension installed on your host system, not
in the container.

You could run `make install` under `sudo` to install the package system-wide
(to `/usr/share/gnome-shell/extensions`):

    $ sudo make install

However, `sudo` installation is not recommended. Instead, you should build and
use OS-specific packages (`.deb`, `.rpm`). `make DESTDIR=... install` should
work fine in DEB and RPM build scripts.

There are explicit targets for system-wide and user installation:

    $ make user-install
    $ sudo make system-install

`make install` just switches between them according to the current uid.

## 6.2. Restart GNOME Shell

Described in [INSTALL.md - step 3](INSTALL.md#3-restart-gnome-shell).

## 6.3. Enable the extension

You can enable the extension as described in
[INSTALL.md - step 4](INSTALL.md#4-enable-the-extension), or by running:

    $ make enable

You'll have to perform this step only once.

# `make develop`

Instead of building and installing the package, you can simply symlink the
repository into GNOME Shell's extensions directory. `make develop` can do it
for you:

    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git
    $ cd gnome-shell-extension-ddterm
    $ npm install
    $ make develop

`make develop` replaces steps 5 and 6.1, but you still have to restart GNOME
Shell afterwards, and enable the extension if you didn't.

`make develop` may be more convenient when you're developing/modifying the code.
