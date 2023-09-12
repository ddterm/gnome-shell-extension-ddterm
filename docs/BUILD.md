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

- GNU `make`

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`libgtk-4-bin` package on Ubuntu, `gtk4-devel` package
on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

- `msgcmp`, `msgmerge`, `xgettext` (`gettext` package)

- `zip`

## 3.b) Build in a container

Alternatively, you can use `docker` or `podman` to perform build steps in a
container - the same image/environment that's used by the CI system. To do it,
run build commands with `./do-in-docker.sh` or `./do-in-podman.sh` wrapper:

    $ ./do-in-docker.sh npm install
    $ ./do-in-docker.sh make pack

# 4. `make pack`

To build the package, run `make pack`:

    $ make pack

If you want to build in a docker/podman container, prepend `./do-in-docker.sh`/
`./do-in-podman.sh`:

    $ ./do-in-docker.sh make pack

# 5. Install the package

The installation process is described in
[INSTALL.md - continue from step 2](INSTALL.md#2-install-the-package).

Alternatively, you could use `make` to install the package too.

## 5.1. `make install`

To install the package, run:

    $ make install

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

## 5.2. Restart GNOME Shell

Described in [INSTALL.md - step 3](INSTALL.md#3-restart-gnome-shell).

## 5.3. Enable the extension

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
