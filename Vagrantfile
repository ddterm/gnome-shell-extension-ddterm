# -*- mode: ruby -*-
# vi: set ft=ruby :

# See docs/Vagrant.md

require 'open3'
require 'pathname'

CPUS = 4
MEMORY = 2048
PROJECT_DIR = Pathname.new(__FILE__).realpath.dirname
SYNCED_FOLDER = "/home/vagrant/#{PROJECT_DIR.basename}"
UUID = 'ddterm@amezin.github.com'
PACK_FILE = ENV.fetch('DDTERM_BUILT_PACK', Pathname.getwd / "#{UUID}.shell-extension.zip")
PACK_FILE_NAME = PACK_FILE.basename

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
    destination: "$HOME/#{PACK_FILE_NAME}",
    before: 'install',
    run: 'always'

  config.vm.provision 'install', type: 'shell', privileged: false, run: 'always', inline: <<-SCRIPT
    gnome-extensions install -f $HOME/#{PACK_FILE_NAME}
    gnome-extensions enable #{UUID}
  SCRIPT

  config.vm.provision 'reload', type: 'shell', run: 'always', after: 'install', inline: <<-SCRIPT
    loginctl terminate-user vagrant
  SCRIPT

  config.vm.define "fedora39", primary: true do |version|
    version.vm.box = "mezinalexander/fedora39"
  end

  config.vm.define "ubuntu2310", autostart: false do |version|
    version.vm.box = "mezinalexander/ubuntu2310"
  end

  config.vm.define "silverblue39", autostart: false do |version|
    version.vm.box = "mezinalexander/silverblue39"
  end

  config.vm.define "opensusetumbleweed", autostart: false do |version|
    version.vm.box = "mezinalexander/opensusetumbleweed"
  end

  config.vm.define "opensuseleap155", autostart: false do |version|
    version.vm.box = "mezinalexander/opensuseleap155"
  end

  config.vm.define "alpine319", autostart: false do |version|
    version.vm.box = "mezinalexander/alpine319"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end

  config.vm.define "alpine318", autostart: false do |version|
    version.vm.box = "mezinalexander/alpine318"
    version.ssh.sudo_command = "doas -n -u root %c"

    version.vm.synced_folder '.', SYNCED_FOLDER,
      type: 'rsync',
      rsync__exclude: rsync_excludes,
      rsync__rsync_path: 'doas -u root rsync',
      rsync__args: rsync_args
  end
end
