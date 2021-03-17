FROM fedora:33
RUN dnf install -y gtk3-devel gtk4-devel libxslt gnome-shell make npm xorg-x11-server-Xvfb
RUN npm install -g eslint
