# Command line

You can open a new tab from the command line:

    $ com.github.amezin.ddterm -- ssh localhost

See `com.github.amezin.ddterm --help` for options.

You'll need to add
`~/.local/share/gnome-shell/extensions/ddterm@amezin.github.com/bin` to `PATH`.

## `gapplication`

You could also interact with ddterm through `gapplication` utility:

    $ gapplication action com.github.amezin.ddterm show
    $ gapplication action com.github.amezin.ddterm hide
    $ gapplication action com.github.amezin.ddterm toggle

Open a new tab with the specified working directory:

    $ gapplication launch com.github.amezin.ddterm ~/directory

Or launch a script:

    $ gapplication launch com.github.amezin.ddterm ~/script.sh
