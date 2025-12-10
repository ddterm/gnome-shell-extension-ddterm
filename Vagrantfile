# SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

# See docs/Vagrant.md

require 'open3'
require 'pathname'

CPUS = 4
MEMORY = 8192
PROJECT_DIR = Pathname.new(__FILE__).realpath.dirname
SYNCED_FOLDER = "/home/vagrant/#{PROJECT_DIR.basename}"
UUID = 'ddterm@amezin.github.com'

EXTENSION_BUNDLE = Pathname.getwd / ENV.fetch('EXTENSION_BUNDLE') do |; bundles|
  bundles = Pathname.getwd.glob('**/*.shell-extension.zip')
  raise 'Found no extension bundle in the current directory or subdirectories, use meson devenv' if bundles.empty?
  raise "Found multiple extension bundles: #{bundles}, use meson devenv" if bundles.length > 1
  bundles[0]
end

stdout, status = Open3.capture2(
  'git',
  'ls-files',
  '--exclude-standard',
  '-oi',
  '--deduplicate',
  '--directory',
  '--no-empty-directory',
  '--full-name',
  ':/'
)

if status.success?
  rsync_excludes = stdout.split(/\n/).map { |p| "/#{p}" }
else
  rsync_excludes = []
end

rsync_args = [
  '-avcS',
  '--exclude-from=.gitignore',
]

Vagrant.configure("2") do |config|
  config.vagrant.plugins = 'vagrant-libvirt'

  config.vm.provider 'libvirt' do |libvirt, override|
    libvirt.qemu_use_session = true
    libvirt.cpus = CPUS
    libvirt.memory = MEMORY
    libvirt.cputopology :sockets => '1', :cores => "#{CPUS}", :threads => '1'
  end

  config.vm.synced_folder '.', '/vagrant', disabled: true
  config.vm.synced_folder '.', SYNCED_FOLDER,
    type: 'rsync',
    rsync__exclude: rsync_excludes,
    rsync__args: rsync_args

  config.vm.provision 'copy',
    type: 'file',
    source: EXTENSION_BUNDLE,
    destination: "$HOME/#{EXTENSION_BUNDLE.basename}",
    before: 'install',
    run: 'always'

  config.vm.provision 'install', type: 'shell', privileged: false, run: 'always', inline: <<-SCRIPT
    gnome-extensions install -f $HOME/#{EXTENSION_BUNDLE.basename}

    if [ -z "$DBUS_SESSION_BUS_ADDRESS" ] && [ -z "$XDG_RUNTIME_DIR" ]; then
        dbus-run-session -- gnome-extensions enable #{UUID}
    else
        gnome-extensions enable #{UUID}
    fi
  SCRIPT

  config.vm.provision 'reload', type: 'shell', run: 'always', after: 'install', inline: <<-SCRIPT
    if [ "$(loginctl show-user --property=State --value vagrant)" = "active" ]; then
        loginctl terminate-user vagrant
    fi
  SCRIPT

  config.vm.define "fedora43", autostart: false do |version|
    version.vm.box = "gnome-shell-box/fedora43"
  end

  config.vm.define "silverblue43", autostart: false do |version|
    version.vm.box = "gnome-shell-box/silverblue43"
  end

  config.vm.define "fedora42", autostart: false do |version|
    version.vm.box = "gnome-shell-box/fedora42"
  end

  config.vm.define "silverblue42", autostart: false do |version|
    version.vm.box = "gnome-shell-box/silverblue42"
  end

  config.vm.define "fedora41", autostart: false do |version|
    version.vm.box = "gnome-shell-box/fedora41"
  end

  config.vm.define "silverblue41", autostart: false do |version|
    version.vm.box = "gnome-shell-box/silverblue41"
  end

  config.vm.define "ubuntu2404", autostart: false do |version|
    version.vm.box = "gnome-shell-box/ubuntu2404"
  end

  config.vm.define "ubuntu2504", autostart: false do |version|
    version.vm.box = "gnome-shell-box/ubuntu2504"
  end

  config.vm.define "ubuntu2510", primary: true do |version|
    version.vm.box = "gnome-shell-box/ubuntu2510"
  end

  config.vm.define "debian13", autostart: false do |version|
    version.vm.box = "gnome-shell-box/debian13"
  end

  config.vm.define "opensusetumbleweed", autostart: false do |version|
    version.vm.box = "gnome-shell-box/opensusetumbleweed"
  end

  config.vm.define "nixos", autostart: false do |version|
    version.vm.box = "gnome-shell-box/nixos"
  end

  config.vm.define "archlinux", autostart: false do |version|
    version.vm.box = "gnome-shell-box/archlinux"
  end

  config.vm.define "alpine320", autostart: false do |version|
    version.vm.box = "gnome-shell-box/alpine320"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end

  config.vm.define "alpine321", autostart: false do |version|
    version.vm.box = "gnome-shell-box/alpine321"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end

  config.vm.define "alpine322", autostart: false do |version|
    version.vm.box = "gnome-shell-box/alpine322"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end
end
