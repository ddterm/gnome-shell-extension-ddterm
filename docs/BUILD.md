# 1. Obtain the source code

## 1.a) Using `git`

    $ git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git

## 1.b) Download as archive and unpack

GitHub UI provides multiple options for downloading the source code as a `.zip`
(or, sometimes, `.tar.gz`) archive - for releases, and arbitrary commits.

# 2. Set up the build environment

## 2.a) Install the necessary dependencies

To build the extension package, you should have the following tools installed:

- [Meson build system](https://mesonbuild.com/) - available as a package named
`meson` in multiple distributions. It automatically brings in a tool called
[`ninja`](https://ninja-build.org/) (package `ninja-build`) and Python 3.

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`libgtk-4-bin` package on Ubuntu, `gtk4-devel` package
on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

- `msgcmp`, `msgmerge`, `xgettext` (`gettext` package)

- `zip`

## 2.b) Build in a container

Alternatively, you can use `docker` or `podman` to perform build steps in a
container - the same image/environment that's used by the CI system. To do it,
run build command with `./do-in-docker.sh` or `./do-in-podman.sh` wrapper:

    $ ./do-in-docker.sh meson setup build-dir

# 3. Build the package

To build the package, `cd` into the directory with the source code:

    $ cd gnome-shell-extension-ddterm

and run the following commands:

    $ meson setup build-dir
    $ ninja -C build-dir pack

Meson puts all built/generated files into a separate directory, in this document
it will be `build-dir`.

If you want to build in a docker/podman container, prepend `./do-in-docker.sh`/
`./do-in-podman.sh`:

    $ ./do-in-docker.sh meson setup build-dir
    $ ./do-in-docker.sh ninja -C build-dir pack

After these steps, you should have the package:
`build-dir/ddterm@amezin.github.com.shell-extension.zip`.

If the process fails, please double-check that you have all the dependencies
(2.a) installed.

# 4. Install the package

The installation process is described in
[INSTALL.md - continue from step 2](INSTALL.md#2-install-the-package).

Alternatively, you could use `meson`/`ninja` to install the package too -
but only if you didn't use containers for the build.

## 4.1.a) `meson install`

You should never run `meson install` with `./run-in-docker.sh` or
`./run-in-podman.sh`. If build has been performed in the container,
installation on the host system through `meson install` will fail.

You may run `meson install` under `sudo` to install the package system-wide
(to `/usr/share/gnome-shell/extensions`):

    $ sudo meson install -C build-dir

Or, the same command with ninja:

    $ sudo ninja -C build-dir install

Installed files can be removed with the following command:

    $ sudo ninja -C build-dir uninstall

However, `sudo` installation is not recommended. Instead, you should build and
use OS-specific packages (`.deb`, `.rpm`). `meson install ... --destdir ...`
should work fine in DEB and RPM build scripts. See Arch Linux
[PKGBUILD](/PKGBUILD) for example.

## 4.1.b) `user-install`

The following command builds the package, if necessary, and installs it
inside user's `$HOME` directory (i.e. typical install location for extensions):

    $ ninja -C build-dir user-install

The extension can be uninstalled using the following command:

    $ ninja -C build-dir user-install

## 4.2. Restart GNOME Shell

Described in [INSTALL.md - step 3](INSTALL.md#3-restart-gnome-shell).

## 4.3. Enable the extension

You can enable the extension as described in
[INSTALL.md - step 4](INSTALL.md#4-enable-the-extension), or by running:

    $ ninja -C build-dir enable

You'll have to perform this step only once.
