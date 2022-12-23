# -*- mode: ruby -*-
# vi: set ft=ruby :

# See docs/Vagrant.md

require 'open3'

CPUS = 4
MEMORY = 2048

stdout, status = Open3.capture2('git', 'ls-files', '--exclude-standard', '-oi', '--directory')
if status.success?
  rsync_excludes = stdout.split(/\n/)
else
  rsync_excludes = []
end

Vagrant.configure("2") do |config|
  config.vm.provider 'virtualbox' do |virtualbox, override|
    virtualbox.cpus = CPUS
    virtualbox.memory = MEMORY
    virtualbox.gui = true
    virtualbox.default_nic_type = 'virtio'
    virtualbox.customize ['modifyvm', :id, '--accelerate3d', 'on', '--vram', '128', '--graphicscontroller', 'vmsvga']
  end

  config.vm.provider 'libvirt' do |libvirt, override|
    libvirt.cpus = CPUS
    libvirt.memory = MEMORY

    if Vagrant.has_plugin?('vagrant-libvirt', '> 0.5.3')
      libvirt.channel :type => 'unix', :target_name => 'org.qemu.guest_agent.0', :target_type => 'virtio'
      libvirt.qemu_use_agent = true
    end

    libvirt.qemu_use_session = true

    libvirt.graphics_type = 'spice'
    libvirt.channel :type => 'spicevmc', :target_name => 'com.redhat.spice.0', :target_type => 'virtio'

    # https://github.com/vagrant-libvirt/vagrant-libvirt/pull/1386
    if Vagrant.has_plugin?('vagrant-libvirt', '>= 0.7.0')
      libvirt.video_accel3d = true
      libvirt.video_type = 'virtio'
      libvirt.graphics_autoport = 'no'
      if Vagrant.has_plugin?('vagrant-libvirt', '>= 0.8.0')
        libvirt.graphics_port = nil
        libvirt.graphics_ip = nil
      else
        libvirt.graphics_ip = 'none'
        libvirt.graphics_port = 0
      end
    end
  end

  config.vm.define "ubuntu2210", autostart: false do |version|
    version.vm.box = "generic/ubuntu2210"
  end

  config.vm.define "ubuntu2204", primary: true do |version|
    version.vm.box = "generic/ubuntu2204"
  end

  config.vm.define "ubuntu2004", autostart: false do |version|
    version.vm.box = "generic/ubuntu2004"
  end

  config.vm.define "fedora37", autostart: false do |version|
    version.vm.box = "generic/fedora37"
  end

  config.vm.define "fedora36", autostart: false do |version|
    version.vm.box = "generic/fedora36"
  end

  config.vm.define "fedora35", autostart: false do |version|
    version.vm.box = "generic/fedora35"
  end

  config.vm.define "centos9", autostart: false do |version|
    version.vm.box = "generic/centos9s"
  end

  config.vm.define "opensuse15", autostart: false do |version|
    version.vm.box = "generic/opensuse15"
  end

  config.vm.synced_folder '.', '/vagrant', type: 'rsync', rsync__exclude: rsync_excludes

  config.vm.provision 'prepare', type: 'ansible' do |ansible|
    ansible.playbook = 'vagrant-provision/prepare.yml'
    ansible.groups = {
      'all:vars' => { 'ansible_python_interpreter' => '/usr/bin/python3' }
    }
  end

  config.vm.provision 'deploy', type: 'ansible', run: 'always' do |ansible|
    ansible.playbook = 'vagrant-provision/deploy.yml'
    ansible.groups = {
      'all:vars' => { 'ansible_python_interpreter' => '/usr/bin/python3' }
    }
  end
end
