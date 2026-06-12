<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

<!-- markdownlint-configure-file { "line-length": { "code_blocks": false } } -->

# Vagrant VMs

There is a [`Vagrantfile`] in the root of the repository. You can use it
to spin up testing VMs with different Linux distros. For the actual list of
distributions (and also VM names), look at `config.vm.define` blocks in the
[`Vagrantfile`].

[`Vagrantfile`]: /Vagrantfile

Currently, all VMs are custom-built boxes, with [`vagrant-libvirt`] provider
only. See: <https://github.com/ddterm/gnome-shell-box>

[`vagrant-libvirt`]: https://vagrant-libvirt.github.io/vagrant-libvirt/installation.html

QEMU/libvirt VMs use SPICE for display. So you'll have to install
`virt-manager`, `virt-viewer`, GNOME Boxes, or a similar GUI.

## Start a VM

ddterm will be installed into the VM from the extension bundle. So if you
haven't built the bundle yet, you'll need to do so:

    meson setup build-dir
    ninja -C build-dir bundle

Then:

    vagrant up fedora42

will start Fedora 42 VM, and will install ddterm into the VM.

`Vagrantfile` automatically searches for `*.shell-extension.zip` file in the
current directory, or in its subdirectories.

If there are multiple files/directories, or if the build directory isn't
a subdirectory of the current directory, Vagrant should be started from
`meson devenv`:

    meson devenv -C build-dir -w . vagrant up fedora42

Instead of prefixing `vagrant` command with `meson devenv ...` every time,
it's possible to just run `meson devenv -C build-dir` once. It will start a new
shell with all necessary environment variables, and raw `vagrant` commands will
work in that shell without additional setup.

Then connect to the VM using `virt-manager`. VMs are started in user session,
so if you can't find the VM in `virt-manager`, click
`File`->`Add Connection...`, choose `QEMU/KVM user session`, click `Connect`.

Or you may try to connect to the VM with GNOME Boxes - it connects to the user
session by default.

## Reinstall ddterm

If you've made some changes to ddterm sources, and want to test them, rebuild
the bundle:

    ninja -C build-dir bundle

and reinstall it:

    meson devenv -C build-dir -w . vagrant provision fedora42

GNOME Shell session in the VM will automatically be terminated, you'll have to
login again - because GNOME Shell can't reload extensions without a complete
restart.

## `virbr0` Network Issue

`vagrant-libvirt` relies on the default network bridge `virbr0`.
It should be configured by the system libvirt daemon.

When getting the following error:

    /home/amezin/.vagrant.d/gems/3.4.8/gems/fog-libvirt-0.15.0/lib/fog/libvirt/requests/compute/vm_action.rb:7:in 'Libvirt::Domain#create': Call to virDomainCreate failed: /usr/lib/qemu/qemu-bridge-helper --use-vnet --br=virbr0 --fd=30: failed to communicate with bridge helper: stderr=failed to get mtu of bridge `virbr0': No such device (Libvirt::Error)

Make sure the default network is started:

    sudo virsh net-start default

To start it automatically on boot:

    sudo virsh net-autostart default

Also, make sure the libvirt daemon is running:

    sudo systemctl enable --now libvirtd
