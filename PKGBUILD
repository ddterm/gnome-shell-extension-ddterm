pkgname=gnome-shell-extension-ddterm-git
pkgver=54
pkgrel=1
pkgdesc="Another Drop Down Terminal Extension for GNOME Shell"
arch=('any')
url='https://github.com/ddterm/gnome-shell-extension-ddterm'
license=('GPL-3.0-or-later')
conflicts=('gnome-shell-extension-ddterm')
provides=('gnome-shell-extension-ddterm')
depends=('gjs' 'gtk3' 'vte3' 'libhandy')
makedepends=('meson' 'git' 'gtk4' 'libxslt' 'xorg-server-xvfb')
source=("$pkgname::git+file://$(git rev-parse --show-toplevel)")
md5sums=('SKIP')

pkgver() {
    cd "$pkgname"
    git describe --long --tags | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g'
}

build() {
    arch-meson $pkgname build

    # gtk-builder-tool needs X or Wayland
    LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -- meson compile -C build
}

package() {
    meson install -C build --destdir "$pkgdir"
}
