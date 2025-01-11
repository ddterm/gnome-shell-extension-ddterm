# SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: CC0-1.0

pkgname=gnome-shell-extension-ddterm-git
pkgver=58
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
source=("$pkgname::git+file://$(pwd)")
md5sums=('SKIP')

pkgver() {
    cd "$pkgname"
    git describe --long --tags | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g'
}

build() {
    arch-meson $pkgname build -Dlinters=disabled "-Dtests=$( ((CHECKFUNC)) && echo enabled || echo disabled )"

    # gtk-builder-tool needs X or Wayland
    LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -- meson compile -C build
}

check() {
    LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -- meson test -C build --print-errorlogs
}

package() {
    meson install -C build --destdir "$pkgdir"
}
