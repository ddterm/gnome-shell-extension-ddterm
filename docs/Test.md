# ddterm tests

## System requirements

* Python 3

* tox: <https://tox.wiki/>

* podman: <https://podman.io/>

* PyGObject: <https://pygobject.readthedocs.io/> or its build dependencies.

* ImageMagick library: <https://imagemagick.org/>.

## Running

### Download container images

    $ tox -e podman-compose -- pull

### Optional: remove outdated container images

    $ tox -e remove-old-images

### Run tests

    $ tox [--sitepackages] -- <options...>

Without `--sitepackages` you'll have to install PyGObject's build dependencies.

Options:

`--image=IMAGE` - run tests using the specified container image `IMAGE`. Can
be repeated multiple times to run tests with multiple images.

`--compose-service=COMPOSE_SERVICE` - run tests using the specified container
image from [`compose.yaml`]. Can be repeated multiple times to run tests
with multiple images.

`--screenshot-failing-only` - capture screenshots only for failing tests.

`--pack=PACK` - install ddterm from the specified `PACK` package file.

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
combinations, [pairwise testing] (using [allpairspy]) is applied.

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
[allpairspy]: https://github.com/thombashi/allpairspy
[GNOME Shell containers]: https://github.com/ddterm/gnome-shell-pod
[`compose.yaml`]: /test/compose.yaml
