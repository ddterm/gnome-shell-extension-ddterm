#!/bin/bash

IMAGE="ghcr.io/amezin/gnome-shell-pod-34:master"
SERVICE="gnome-xsession"
PACKAGE="ddterm@amezin.github.com.shell-extension.zip"
DISPLAY=":99"
PULL=0

usage() {
    >&2 echo "Usage: $0 [-i image] [-p] [-s service] [-f package] [-d display]"
    >&2 echo " -i image: Docker/Podman image to run. Default: ${IMAGE}"
    >&2 echo " -p: Pull the image before running."
    >&2 echo " -s service: Systemd service (GNOME shell type) to run. Default: ${SERVICE}"
    >&2 echo " -p package: Path to GNOME Shell extension package. Default: ${PACKAGE}"
    >&2 echo " -d display: X11 display in the container. Default: ${DISPLAY}"
}

while getopts "pi:s:f:h" opt; do
    case $opt in
    i) IMAGE="${OPTARG}";;
    s) SERVICE="${OPTARG}";;
    f) PACKAGE="${OPTARG}";;
    d) DISPLAY="${OPTARG}";;
    p) PULL=1;;
    h) usage; exit 0;;
    *) usage; exit 1;;
    esac
done

set -ex

EXTENSION_UUID="$(unzip -p "${PACKAGE}" metadata.json | jq -r .uuid)"
EXTENSION_PACKAGE_FILENAME="${EXTENSION_UUID}.shell-extension.zip"
PACKAGE_FULLPATH="$(realpath "${PACKAGE}")"
PACKAGE_MOUNTPATH="/home/gnomeshell/${EXTENSION_PACKAGE_FILENAME}"

if (( PULL )); then
    podman pull "${IMAGE}"
fi

POD=$(podman run --rm --cap-add=SYS_NICE --cap-add=IPC_LOCK -v "${PACKAGE_FULLPATH}:${PACKAGE_MOUNTPATH}:ro" -td "${IMAGE}")

down () {
    podman kill "${POD}"
    wait
}

trap down INT TERM EXIT

do_in_pod() {
    podman exec --user gnomeshell --workdir /home/gnomeshell "${POD}" set-env.sh "$@"
}

# gnome-extensions install doesn't need a running GNOME Shell
# Even if it will need it at some point, we can simply unzip the archive instead.
do_in_pod gnome-extensions install "${PACKAGE_MOUNTPATH}"

do_in_pod timeout 10s wait-user-bus.sh

do_in_pod journalctl --user -f | tee journal.txt &

do_in_pod systemctl --user start "${SERVICE}@${DISPLAY}"
do_in_pod timeout 10s wait-dbus-interface.sh -d org.gnome.Shell -o /org/gnome/Shell -i org.gnome.Shell.Extensions
do_in_pod gnome-extensions enable "${EXTENSION_UUID}"

# Start of ddterm-specific script - run tests using private D-Bus interface
do_in_pod timeout 10s wait-dbus-interface.sh -d org.gnome.Shell -o /org/gnome/Shell/Extensions/ddterm -i com.github.amezin.ddterm.Extension

exit_code=0
do_in_pod gdbus call --session --timeout 300 --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.RunTest || exit_code=$?

podman cp "${POD}:/run/Xvfb_screen0" - | tar xf - --to-command 'convert xwd:- $TAR_FILENAME.png'

exit $exit_code
