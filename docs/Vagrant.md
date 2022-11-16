# Vagrant VMs

There is a [`Vagrantfile`] in the root of the repository. You could use it
to spin up testing VMs with different Linux distros. For the actual list of
distributions (and also VM names), look at `config.vm.define` blocks in the
[`Vagrantfile`].

## Dependencies

Besides Vagrant, Ansible will be required to configure the VM.

If you prefer VirtualBox, `vagrant-vbguest` plugin is recommended:

    $ vagrant plugin install vagrant-vbguest

If you prefer QEMU, it is supported through libvirt and
[`vagrant-libvirt`](https://vagrant-libvirt.github.io/vagrant-libvirt/installation.html).

QEMU/libvirt VMs use SPICE for display. So you'll have to install `virt-manager`
or a similar GUI.

## Start a VM

ddterm will be installed into the VM from the extension package. So if you
haven't built the package yet, you'll need to do so:

    $ make pack

Then:

    $ vagrant up ubuntu2204

will start Ubuntu 22.04 VirtualBox VM, install the necessary packages
(primarily GNOME Shell with dependencies), and will install ddterm into the VM.

If you prefer QEMU, pass `--provider=libvirt` to `vagrant up`:

    $ vagrant up --provider=libvirt ubuntu2204

Then connect to the VM using `virt-manager`. VMs are started in user session,
so if you can't find the VM in `virt-manager`, click
`File`->`Add Connection...`, choose `QEMU/KVM user session`, click `Connect`.

## Reinstall ddterm

If you've made some changes to ddterm sources, and want to test them, rebuild
the package:

    $ make pack

and reinstall it:

    $ vagrant provision --provision-with deploy ubuntu2204

GNOME Shell session in the VM will automatically be terminated, you'll have to
login again - because GNOME Shell can't reload extensions without a complete
restart.

You may omit `--provision-with deploy`:

    $ vagrant provision --provision-with deploy ubuntu2204

but the process might take longer in this case, because Ansible will try to
upgrade OS packages.

[`Vagrantfile`]: /Vagrantfile
