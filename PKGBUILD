pkgname=gnome-shell-extension-ddterm-git
pkgver=48
pkgrel=1
pkgdesc="Another Drop Down Terminal Extension for GNOME Shell"
arch=('any')
url='https://github.com/ddterm/gnome-shell-extension-ddterm'
license=('GPL3')
conflicts=('gnome-shell-extension-ddterm')
provides=('gnome-shell-extension-ddterm')
depends=('gjs' 'gtk3' 'vte3')
makedepends=('git' 'gtk4' 'libxslt')
source=("$pkgname::git+file://$(git rev-parse --show-toplevel)")
md5sums=('SKIP')

pkgver() {
    cd "$pkgname"
    git describe --long --tags | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g'
}

build() {
    cd "$pkgname"
    make build
}

package() {
    cd "$pkgname"
    make DESTDIR="$pkgdir/" install
}
