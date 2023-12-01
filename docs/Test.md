# ddterm tests

## System requirements

* Python 3

* tox: <https://tox.wiki/>

* podman: <https://podman.io/>

* PyGObject: <https://pygobject.readthedocs.io/> or its build dependencies.

* ImageMagick library: <https://imagemagick.org/>.

## Running

### Download container images

    $ tox -e images -- pull

### Optional: remove outdated container images

    $ tox -e images -- prune

Or to do both at the same time:

    $ tox -e images -- pull --prune

### Run tests

    $ tox [--sitepackages] -- [--pack=path] <other-options...>

Before running tests, you need to [build the extension package](/docs/BUILD.md).

You either have to specify:

    `--pack=path/to/built/ddterm@amezin.github.com.shell-extension.zip`

or run tox from `meson devenv -C build-dir` shell.

Without `--sitepackages` you'll have to install PyGObject's build dependencies,
and PyGObject will be automatically built from source by `tox`.

#### Other options:

`--image=IMAGE` - run tests using the specified container image `IMAGE`. Can
be repeated multiple times to run tests with multiple images.

`--compose-service=COMPOSE_SERVICE` - run tests using the specified container
image from [`compose.yaml`]. Can be repeated multiple times to run tests
with multiple images.

`--screenshot-failing-only` - capture screenshots only for failing tests.

`-n numprocesses` - run `numprocesses` parallel test processes.

If no options are specified, reasonable defaults are used.

To see all available options:

    $ tox [--sitepackages] -- --help

## Report

Test report is created as `report.html` in the `test` directory.

You could also request a report in JUnit format by adding
`--junitxml=filename` option.

## What is being tested

* Window management: tests verify that for a specific combination of settings
(window size, position, maximized/unmaximized flag) the window shows at the
correct location and has the correct size. To reduce the number of settings
combinations, [pairwise testing] (using [PICT]) is applied.

* Basic memory leak tests.

Application's UI is (mostly) not covered.

## How

1. Tests spawn [GNOME Shell containers] with various sessions:

    * Xorg
    * Wayland
    * Wayland with high DPI (2x)
    * Wayland with two monitors.

All of them currently use Xvfb, Wayland compositor runs in nested mode. Tests
connect to the session D-Bus bus over TCP, and use it as the primary
communication channel.

2. ddterm extension is installed and enabled.

3. Then [another extension](/test/extension/extension.js) that provides an
[additional D-Bus interface](/test/extension/com.github.amezin.ddterm.ExtensionTest.xml)
is installed and enabled too.

4. Tests communicate with the installed extensions and application over D-Bus.
Sometimes also reading journal.

[pairwise testing]: https://www.pairwise.org/
[PICT]: https://github.com/microsoft/pict
[GNOME Shell containers]: https://github.com/ddterm/gnome-shell-pod
[`compose.yaml`]: /test/compose.yaml
