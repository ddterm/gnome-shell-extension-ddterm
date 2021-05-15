#!/bin/sh

exec gdbus call --session --timeout 300 --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.RunTest
