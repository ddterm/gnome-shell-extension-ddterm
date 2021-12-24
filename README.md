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

## Installing

The easiest way to install the extension is to go to [extensions.gnome.org].

However, review process on [extensions.gnome.org] is kinda slow, so a new
release may be available here on GitHub, but not on [extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

If you want to install from GitHub: see [docs/INSTALL.md](docs/INSTALL.md)

## Custom styles

If you want to load custom styles, create `~/.ddterm/style.css` file.

An example:

```
/* tab */
notebook tabs tab {
    min-width: 240px;
    font-size: 14px;
    font-family: "Source Code Pro";
}

/* selected tab */
notebook tabs tab:checked {
    background-color: rgba(255, 255, 255, 0.15);
    font-weight: bold;
    box-shadow: -3px 0 #E95420 inset;
}
```

## Toggle the terminal through D-Bus

It's possible to toggle the terminal externally through D-Bus. For example,
from command line:

    $ gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.Toggle
