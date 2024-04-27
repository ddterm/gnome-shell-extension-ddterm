#!/usr/bin/env -S gjs -m

/*
    Copyright © 2022 Aleksandr Mezin

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
import Gio from 'gi://Gio';
import GIRepository from 'gi://GIRepository';

import Gi from 'gi';
import System from 'system';

import { manifest, manifest_file, get_os_ids, resolve_package } from '../dependencies.js';

function find_owner_command(os_ids) {
    for (const os of os_ids) {
        if (os === 'alpine')
            return filepath => ['apk', 'info', '-Wq', filepath];

        if (os === 'arch')
            return filepath => ['pacman', '-Qqo', filepath];

        if (os === 'debian')
            return filepath => ['dpkg-query', '-S', filepath];

        if (os === 'fedora' || os === 'suse')
            return filepath => ['rpm', '--queryformat', '%{NAME}\n', '-qf', filepath];
    }

    return null;
}

function find_owner(filepath, os_ids) {
    const command = find_owner_command(os_ids);

    const spawn_flags = GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.CHILD_INHERITS_STDERR;

    const [, stdout, , wait_status] =
        GLib.spawn_sync(null, command(filepath), null, spawn_flags, null);

    GLib.spawn_check_wait_status(wait_status);

    return new TextDecoder().decode(stdout)
        .split(/[,:]?\s+/)
        .map(v => v.replace(/:(amd64|arm64|armel|armhf|i386|mips64el|ppc64el|s390x)/, ''))
        .filter(v => v !== '' && v !== filepath);
}

function list_files_command(os_ids) {
    for (const os of os_ids) {
        if (os === 'alpine')
            return package_name => ['apk', 'info', '-Lq', package_name];

        if (os === 'arch')
            return package_name => ['pacman', '-Qql', package_name];

        if (os === 'debian')
            return package_name => ['dpkg-query', '-L', package_name];

        if (os === 'fedora' || os === 'suse')
            return package_name => ['rpm', '-ql', '--whatprovides', package_name];
    }

    return null;
}

function list_files(package_name, os_ids) {
    const command = list_files_command(os_ids);

    const spawn_flags = GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.CHILD_INHERITS_STDERR;

    const [, stdout, , wait_status] =
        GLib.spawn_sync(null, command(package_name), null, spawn_flags, null);

    GLib.spawn_check_wait_status(wait_status);

    return new TextDecoder().decode(stdout).split(/\n/).filter(v => v !== '');
}

function update_manifest(dry_run = false) {
    const os_ids = get_os_ids();
    let updated = false;

    for (const [lib, lib_manifest] of Object.entries(manifest)) {
        for (const [version, version_manifest] of Object.entries(lib_manifest)) {
            Gi.require(lib, version);

            const filepath = GIRepository.Repository.get_default().get_typelib_path(lib);
            const basename = Gio.File.new_for_path(filepath).get_basename();

            if (version_manifest.filename !== basename) {
                version_manifest.filename = basename;
                updated = true;
            }

            const resolved = resolve_package(version_manifest, os_ids);

            if (resolved && list_files(resolved, os_ids).includes(filepath)) {
                printerr(`${filepath} manifest: ${resolved} package contains ${filepath}`);
                continue;
            }

            const found = find_owner(filepath, os_ids);

            if (found.length === 0)
                throw new Error(`Can't find package for file ${filepath}`);

            if (found.length > 1) {
                throw new Error(
                    `Multiple packages found for ${filepath}: ${found.join(' ')}`
                );
            }

            printerr(`${filepath} found package: ${found[0]} manifest: ${resolved}`);

            if (resolved !== found[0]) {
                version_manifest[os_ids[0]] = found[0];
                updated = true;
            }
        }
    }

    if (!dry_run && updated) {
        manifest_file.replace_contents(
            JSON.stringify(manifest, undefined, 1),
            null,
            false,
            Gio.FileCreateFlags.NONE,
            null
        );
    }

    return updated;
}

const app = Gio.Application.new(null, 0);

app.add_main_option(
    'dry-run',
    'n',
    GLib.OptionFlags.NONE,
    GLib.OptionArg.NONE,
    "Check, don't update, exit with code 1 if updates are necessary",
    null
);

app.add_main_option(
    GLib.OPTION_REMAINING,
    0,
    GLib.OptionFlags.NONE,
    GLib.OptionArg.STRING_ARRAY,
    '',
    null
);

app.connect('handle-local-options', (_, options) => {
    const unexpected = options.lookup(GLib.OPTION_REMAINING, 'as', true);

    if (unexpected?.length) {
        printerr(`Unexpected arguments: ${unexpected.join(' ')}`);
        return 1;
    }

    const check = Boolean(options.lookup('dry-run', 'b'));
    const updated = update_manifest(check);

    return check && updated ? 1 : 0;
});

System.exit(app.run([System.programInvocationName].concat(ARGV)));
