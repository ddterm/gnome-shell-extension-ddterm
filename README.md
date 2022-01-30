# Another Drop Down Terminal Extension for GNOME Shell

[<img src="docs/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][extensions.gnome.org]

<img src="docs/dropdown.gif" />

Inspired by

- https://github.com/bigbn/drop-down-terminal-x

- https://github.com/Guake/guake

## Distinguishing features

- Runs on Wayland natively

- Terminal window can be resized by dragging the border with mouse

- `Preferences` window with a lot of different settings

<img src="docs/prefs.gif" />

## Review by [TechHut](https://www.youtube.com/channel/UCjSEJkpGbcZhvo0lr-44X_w)

[![my favorite GNOME extension](http://img.youtube.com/vi/tF6_FJYca64/0.jpg)](http://www.youtube.com/watch?v=tF6_FJYca64)

## Installing

The easiest way to install the extension is to go to [extensions.gnome.org].

However, review process on [extensions.gnome.org] is kinda slow, so a new
release may be available here on GitHub, but not on [extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

If you want to install from GitHub: see [docs/INSTALL.md](docs/INSTALL.md)

## Toggle the terminal through D-Bus

It's possible to toggle the terminal externally through D-Bus. For example,
from command line:

    $ gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.Toggle
