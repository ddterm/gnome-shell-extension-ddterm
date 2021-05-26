#!/bin/sh

exec gdbus call --session --timeout 1000 --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.ExtensionTest.RunTest "$@"
