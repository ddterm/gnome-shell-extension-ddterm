# SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: CC0-1.0

pkgname=gnome-shell-extension-ddterm-git
pkgver=62
pkgrel=1
pkgdesc="Another Drop Down Terminal Extension for GNOME Shell"
arch=('any')
url='https://github.com/ddterm/gnome-shell-extension-ddterm'
license=('GPL-3.0-or-later')
conflicts=('gnome-shell-extension-ddterm')
provides=('gnome-shell-extension-ddterm')
depends=('gjs' 'gtk3' 'vte3' 'libhandy')
makedepends=('meson' 'git' 'gtk4' 'libxslt' 'xorg-server-xvfb')
checkdepends=('python-pytest' 'python-gobject' 'gnome-shell' 'wl-clipboard')

# Skipping source=() completely, using startdir instead
# https://gitlab.archlinux.org/archlinux/mkinitcpio/mkinitcpio/-/blob/master/PKGBUILD

pkgver() {
    local git_describe='$Format:%(describe:tags=true)$'

    if [[ "$git_describe" == "$"* ]]; then
        git_describe="$(git -C "$startdir" describe --long --tags)"
    fi

    echo "$git_describe" | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g'
}

build() {
    arch-meson "$startdir" build "-Dtests=$( ((CHECKFUNC)) && echo enabled || echo disabled )"

    # gtk-builder-tool needs X or Wayland
    LIBGL_ALWAYS_SOFTWARE=1 xvfb-run --auto-display --server-args=-noreset --wait=0 -- meson compile -C build
}

check() {
    LIBGL_ALWAYS_SOFTWARE=1 xvfb-run --auto-display --server-args=-noreset --wait=0 -- meson test -C build --print-errorlogs
}

package() {
    meson install -C build --destdir "$pkgdir"
}
