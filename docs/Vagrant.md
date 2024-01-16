# Vagrant VMs

There is a [`Vagrantfile`] in the root of the repository. You could use it
to spin up testing VMs with different Linux distros. For the actual list of
distributions (and also VM names), look at `config.vm.define` blocks in the
[`Vagrantfile`].

Currently, all VMs are custom-built boxes, with [`vagrant-libvirt`] provider
only.

QEMU/libvirt VMs use SPICE for display. So you'll have to install
`virt-manager`, `virt-viewer`, GNOME Boxes, or a similar GUI.

## Start a VM

ddterm will be installed into the VM from the extension package. So if you
haven't built the package yet, you'll need to do so:

    $ make pack

Then:

    $ vagrant up --provider=libvirt fedora39

will start Fedora 39 VM, and will install ddterm into the VM.

Then connect to the VM using `virt-manager`. VMs are started in user session,
so if you can't find the VM in `virt-manager`, click
`File`->`Add Connection...`, choose `QEMU/KVM user session`, click `Connect`.

Or you may try to connect to the VM with GNOME Boxes - it connects to the user
session by default.

## Reinstall ddterm

If you've made some changes to ddterm sources, and want to test them, rebuild
the package:

    $ make pack

and reinstall it:

    $ vagrant provision fedora39

GNOME Shell session in the VM will automatically be terminated, you'll have to
login again - because GNOME Shell can't reload extensions without a complete
restart.

[`Vagrantfile`]: /Vagrantfile
[`vagrant-libvirt`]: https://vagrant-libvirt.github.io/vagrant-libvirt/installation.html
