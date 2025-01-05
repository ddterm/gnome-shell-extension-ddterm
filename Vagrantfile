# SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

# See docs/Vagrant.md

require 'open3'
require 'pathname'

CPUS = 4
MEMORY = 4096
PROJECT_DIR = Pathname.new(__FILE__).realpath.dirname
SYNCED_FOLDER = "/home/vagrant/#{PROJECT_DIR.basename}"
UUID = 'ddterm@amezin.github.com'

PACK_FILE_FALLBACK = Pathname.getwd / "#{UUID}.shell-extension.zip"
PACK_FILE_FALLBACK_LEGACY = Pathname.getwd / "#{UUID}.legacy.shell-extension.zip"

if not PACK_FILE_FALLBACK.exist? and PACK_FILE_FALLBACK_LEGACY.exist?
  PACK_FILE_FALLBACK = PACK_FILE_FALLBACK_LEGACY
end

PACK_FILE = Pathname.getwd / ENV.fetch('DDTERM_BUILT_PACK', PACK_FILE_FALLBACK.to_s)

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
  '--exclude-from=test/.gitignore',
  '--exclude-from=tools/.gitignore',
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
    source: PACK_FILE,
    destination: "$HOME/#{PACK_FILE.basename}",
    before: 'install',
    run: 'always'

  config.vm.provision 'install', type: 'shell', privileged: false, run: 'always', inline: <<-SCRIPT
    gnome-extensions install -f $HOME/#{PACK_FILE.basename}

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

  config.vm.define "fedora41", autostart: false do |version|
    version.vm.box = "gnome-shell-box/fedora41"
  end

  config.vm.define "silverblue41", autostart: false do |version|
    version.vm.box = "gnome-shell-box/silverblue41"
  end

  config.vm.define "fedora40", autostart: false do |version|
    version.vm.box = "gnome-shell-box/fedora40"
  end

  config.vm.define "silverblue40", autostart: false do |version|
    version.vm.box = "gnome-shell-box/silverblue40"
  end

  config.vm.define "ubuntu2204", autostart: false do |version|
    version.vm.box = "gnome-shell-box/ubuntu2204"
  end

  config.vm.define "ubuntu2404", primary: true do |version|
    version.vm.box = "gnome-shell-box/ubuntu2404"
  end

  config.vm.define "ubuntu2410", autostart: false do |version|
    version.vm.box = "gnome-shell-box/ubuntu2410"
  end

  config.vm.define "opensusetumbleweed", autostart: false do |version|
    version.vm.box = "gnome-shell-box/opensusetumbleweed"
  end

  config.vm.define "opensuseleap156", autostart: false do |version|
    version.vm.box = "gnome-shell-box/opensuseleap156"
  end

  config.vm.define "debian12", autostart: false do |version|
    version.vm.box = "gnome-shell-box/debian12"
  end

  config.vm.define "alpine318", autostart: false do |version|
    version.vm.box = "gnome-shell-box/alpine318"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end

  config.vm.define "alpine319", autostart: false do |version|
    version.vm.box = "gnome-shell-box/alpine319"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
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
end
