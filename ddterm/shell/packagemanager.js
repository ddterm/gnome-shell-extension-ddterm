// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

function shell_join(argv) {
    return argv.map(arg => GLib.shell_quote(arg)).join(' ');
}

function find_terminal_command() {
    const kgx = GLib.find_program_in_path('kgx');

    if (kgx)
        return argv => [kgx, `--command=${shell_join(argv)}`];

    const gnome_terminal = GLib.find_program_in_path('gnome-terminal');

    if (gnome_terminal)
        return argv => [gnome_terminal, '--', ...argv];

    const xdg_terminal_exec = GLib.find_program_in_path('xdg-terminal-exec');

    if (xdg_terminal_exec)
        return argv => [xdg_terminal_exec, ...argv];

    return null;
}

function communicate_utf8_async(subprocess, stdin, cancellable) {
    return new Promise((resolve, reject) => {
        subprocess.communicate_utf8_async(stdin, cancellable, (source, result) => {
            try {
                resolve(source.communicate_utf8_finish(result));
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

async function test_pkcon(pkcon, cancellable) {
    const launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.STDOUT_PIPE);

    launcher.setenv('LC_ALL', 'C.UTF-8', true);

    const subprocess = launcher.spawnv([pkcon, 'backend-details']);
    const [, stdout] = await communicate_utf8_async(subprocess, null, cancellable);

    GLib.spawn_check_wait_status(subprocess.get_status());

    // Even if `pkcon` exits with code 0, it doesn't mean it works...
    if (!stdout.startsWith('Name:')) {
        throw new Error(
            `Unexpected output from ${pkcon} backend-details: ${JSON.stringify(stdout)}`
        );
    }
}

async function find_package_manager_install_command(cancellable) {
    const pkcon = GLib.find_program_in_path('pkcon');

    if (pkcon) {
        try {
            await test_pkcon(pkcon, cancellable);
            return packages => [pkcon, 'install', '-c', '1000', ...packages];
        } catch (ex) {
            logError(ex, `${pkcon} doesn't seem to work`);
        }
    }

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
    const terminal_command = find_terminal_command();

    if (!terminal_command)
        return null;

    const package_manager_install_command =
        await find_package_manager_install_command(cancellable);

    if (!package_manager_install_command)
        return null;

    return packages => {
        const argv = terminal_command(package_manager_install_command(packages));
        const [, pid] = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.DEFAULT, null);
        GLib.spawn_close_pid(pid);
    };
}
