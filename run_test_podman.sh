#!/bin/bash

IMAGE="ghcr.io/amezin/gnome-shell-pod-34:master"
SERVICE="gnome-xsession"
TEST_FILTER=
TEST_FILTER_OUT="false"
SOURCE_DIR="${PWD}"
DISPLAY=":99"
PULL=0
EXTRA_VOLUMES=

usage() {
    >&2 echo "Usage: $0 [-i image] [-p] [-s service] [-k pattern] [-f package] [-d display]"
    >&2 echo " -i image: Docker/Podman image to run. Default: ${IMAGE}"
    >&2 echo " -p: Pull the image before running."
    >&2 echo " -s service: Systemd service (GNOME shell type) to run. Default: ${SERVICE}"
    >&2 echo " -k substring: Run only tests whose ids include the specified substring."
    >&2 echo " -n: Invert -k pattern - exclude tests matching it."
    >&2 echo " -f: Source directory. Default: ${SOURCE_DIR}"
    >&2 echo " -v volume: Mount file/directory in the container. Passed to podman as is. See podman run --help"
    >&2 echo " -d display: Xvfb display in the container. Default: ${DISPLAY}"
}

while getopts "pi:s:k:nf:v:h" opt; do
    case $opt in
    i) IMAGE="${OPTARG}";;
    s) SERVICE="${OPTARG}";;
    k) TEST_FILTER="${OPTARG}";;
    n) TEST_FILTER_OUT="true";;
    f) SOURCE_DIR="${OPTARG}";;
    v) EXTRA_VOLUMES="${EXTRA_VOLUMES} -v ${OPTARG}";;
    d) DISPLAY="${OPTARG}";;
    p) PULL=1;;
    h) usage; exit 0;;
    *) usage; exit 1;;
    esac
done

EXTENSION_UUID="ddterm@amezin.github.com"
PACKAGE_MOUNTPATH="/home/gnomeshell/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"

set -ex

if (( PULL )); then
    podman pull "${IMAGE}"
fi

POD=$(podman run --rm --cap-add=SYS_NICE --cap-add=IPC_LOCK -v "${SOURCE_DIR}:${PACKAGE_MOUNTPATH}:ro" ${EXTRA_VOLUMES} -td "${IMAGE}")

down () {
    podman kill "${POD}"
    wait
}

trap down INT TERM EXIT

do_in_pod() {
    podman exec --user gnomeshell --workdir /home/gnomeshell "${POD}" set-env.sh "$@"
}

do_in_pod timeout 10s wait-user-bus.sh

do_in_pod journalctl --user -f | tee journal.txt &

do_in_pod systemctl --user start "${SERVICE}@${DISPLAY}"
do_in_pod timeout 10s wait-dbus-interface.sh -d org.gnome.Shell -o /org/gnome/Shell -i org.gnome.Shell.Extensions
do_in_pod gnome-extensions enable "${EXTENSION_UUID}"

# Start of ddterm-specific script - run tests using private D-Bus interface
do_in_pod timeout 10s wait-dbus-interface.sh -d org.gnome.Shell -o /org/gnome/Shell/Extensions/ddterm -i com.github.amezin.ddterm.ExtensionTest

exit_code=0
do_in_pod gdbus call --session --timeout 2000 --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.ExtensionTest.RunTest "${TEST_FILTER}" "${TEST_FILTER_OUT}" || exit_code=$?

podman cp "${POD}:/run/Xvfb_screen0" - | tar xf - --to-command 'convert xwd:- $TAR_FILENAME.png'

exit $exit_code
