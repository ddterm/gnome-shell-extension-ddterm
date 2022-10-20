# -*- mode: ruby -*-
# vi: set ft=ruby :

require 'open3'

CPUS = 4
MEMORY = 2048

FEDORA_VERSIONS = ['32', '33', '34', '35', '36', '37-beta']
UBUNTU_VERSIONS = ['focal', 'impish', 'jammy', 'kinetic']

def copy_env(libvirt, name)
  if ENV.key?(name)
    libvirt.qemuenv name => ENV[name]
  end
end

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

    libvirt.graphics_type = 'sdl'

    copy_env(libvirt, 'DISPLAY')
    copy_env(libvirt, 'XAUTHORITY')
    copy_env(libvirt, 'WAYLAND_DISPLAY')
    copy_env(libvirt, 'SDL_VIDEODRIVER')
    copy_env(libvirt, 'XDG_CURRENT_DESKTOP')
    copy_env(libvirt, 'XDG_SESSION_DESKTOP')
    copy_env(libvirt, 'XDG_SESSION_TYPE')
    copy_env(libvirt, 'XDG_SESSION_CLASS')
    copy_env(libvirt, 'XDG_RUNTIME_DIR')
    copy_env(libvirt, 'XDG_DATA_DIRS')

    # https://github.com/vagrant-libvirt/vagrant-libvirt/pull/1386
    if Vagrant.has_plugin?('vagrant-libvirt', '> 0.6.3')
      libvirt.video_accel3d = true
      libvirt.video_type = 'virtio'
    else
      libvirt.qemuargs :value => '-display'
      libvirt.qemuargs :value => 'sdl,gl=on'

      libvirt.video_type = 'none'
      libvirt.qemuargs :value => '-device'
      libvirt.qemuargs :value => 'virtio-vga-gl' # virtio-vga-gl,id=video0,max_outputs=1,bus=pci.0,addr=0x2
    end
  end

  FEDORA_VERSIONS.each do |fedora_version|
    is_latest = fedora_version == FEDORA_VERSIONS.last
    config.vm.define "f#{fedora_version}", autostart: is_latest, primary: is_latest do |version|
      version.vm.box = "fedora/#{fedora_version}-cloud-base"
    end
  end

  UBUNTU_VERSIONS.each do |ubuntu_version|
    config.vm.define "#{ubuntu_version}", autostart: false, primary: false do |version|
      version.vm.box = "ubuntu/#{ubuntu_version}64"
    end
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
