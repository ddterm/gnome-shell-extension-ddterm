/*
    Copyright © 2024 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import GLib from 'gi://GLib';

import { create_packagekit_proxy } from './packagekit.js';

function shell_join(argv) {
    return argv.map(arg => GLib.shell_quote(arg)).join(' ');
}

function find_terminal_command() {
    const gnome_terminal = GLib.find_program_in_path('gnome-terminal');

    if (gnome_terminal)
        return argv => [gnome_terminal, '--', ...argv];

    const kgx = GLib.find_program_in_path('kgx');

    if (kgx)
        return argv => [kgx, `--command=${shell_join(argv)}`];

    const xdg_terminal_exec = GLib.find_program_in_path('xdg-terminal-exec');

    if (xdg_terminal_exec)
        return argv => [xdg_terminal_exec, ...argv];

    return null;
}

function find_package_manager_install_command() {
    const pkcon = GLib.find_program_in_path('pkcon');

    if (pkcon)
        return packages => [pkcon, 'install', '-c', '1000', ...packages];

    const pkexec = GLib.find_program_in_path('pkexec');

    if (!pkexec)
        return null;

    const os_ids_like = GLib.get_os_info('ID_LIKE')?.split(' ').filter(v => v) ?? [];

    for (const os of [GLib.get_os_info('ID'), ...os_ids_like]) {
        if (os === 'alpine') {
            const apk = GLib.find_program_in_path('apk');

            if (apk)
                return packages => [pkexec, apk, '-U', 'add', ...packages];
        } else if (os === 'arch') {
            const pacman = GLib.find_program_in_path('pacman');

            if (pacman)
                return packages => [pkexec, pacman, '-Sy', ...packages];
        } else if (os === 'debian' || os === 'ubuntu') {
            const apt = GLib.find_program_in_path('apt') ?? GLib.find_program_in_path('apt-get');

            if (apt) {
                return packages => ['sh', '-c', [
                    shell_join([pkexec, apt, 'update']),
                    shell_join(['exec', pkexec, apt, 'install', ...packages]),
                ].join(' && ')];
            }
        } else if (os === 'fedora') {
            const yum = GLib.find_program_in_path('dnf') ?? GLib.find_program_in_path('yum');

            if (yum)
                return packages => [pkexec, yum, 'install', ...packages];
        } else if (os === 'suse') {
            const zypper = GLib.find_program_in_path('zypper');

            if (zypper)
                return packages => [pkexec, zypper, 'install', ...packages];
        }
    }

    return null;
}

export async function find_package_installer(cancellable) {
    try {
        const packagekit = await create_packagekit_proxy(cancellable);
        return (packages, app_id) => packagekit.install_package_names(packages, app_id);
    } catch (ex) {
        logError(ex, "Can't access packagekit session interface");
    }

    const terminal_command = find_terminal_command();

    if (!terminal_command)
        return null;

    const package_manager_install_command = find_package_manager_install_command();

    if (!package_manager_install_command)
        return null;

    return packages => {
        const argv = terminal_command(package_manager_install_command(packages));
        const [, pid] = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.DEFAULT, null);
        GLib.spawn_close_pid(pid);
    };
}
