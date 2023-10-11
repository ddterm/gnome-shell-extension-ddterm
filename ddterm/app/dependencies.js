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

import Gi from 'gi';
import System from 'system';

function get_file(relative_path) {
    return Gio.File.new_for_uri(
        GLib.Uri.resolve_relative(import.meta.url, relative_path, GLib.UriFlags.NONE)
    );
}

export function get_manifest_file() {
    return get_file('dependencies.json');
}

export function get_os_ids() {
    const res = [GLib.get_os_info('ID')];
    const fallback = GLib.get_os_info('ID_LIKE');

    if (fallback)
        res.push(...fallback.split(' '));

    return res;
}

export function load_manifest() {
    return JSON.parse(
        new TextDecoder().decode(
            get_manifest_file().load_contents(null)[1]
        )
    );
}

export function resolve_package(distros, os_ids) {
    if (!distros)
        return null;

    for (const os of os_ids) {
        const match = distros[os];

        if (match)
            return match;
    }

    return null;
}

function resolve_packages(manifest, lib_versions, os_ids) {
    const packages = new Set();
    const unresolved = new Set();

    for (const [lib, version] of Object.entries(lib_versions)) {
        const lib_manifest = manifest[lib];
        const version_manifest = lib_manifest ? lib_manifest[version] : null;
        const pkg = resolve_package(version_manifest, os_ids);

        if (pkg)
            packages.add(pkg);
        else
            unresolved.add(version_manifest.filename);
    }

    return { packages, unresolved };
}

function get_interpreter() {
    try {
        const pid = Gio.Credentials.new().get_unix_pid();
        const [ok_, bytes] = GLib.file_get_contents(`/proc/${pid}/cmdline`);
        const argv0_bytes = bytes.slice(0, bytes.indexOf(0));
        const argv0 = new TextDecoder().decode(argv0_bytes);
        const fullpath = GLib.find_program_in_path(argv0);

        if (fullpath)
            return fullpath;
    } catch (ex) {
        logError(ex);
    }

    return 'gjs';
}

function show_notification(packages, filenames) {
    const cmd = [
        get_interpreter(),
        '-m',
        get_file('dependencies-notification.js').get_path(),
    ];

    for (const pkg of packages)
        cmd.push('--package', pkg);

    for (const filename of filenames)
        cmd.push('--file', filename);

    const [_, pid] = GLib.spawn_async(
        null,
        cmd,
        null,
        GLib.SpawnFlags.SEARCH_PATH,
        null
    );

    GLib.spawn_close_pid(pid);
}

export function gi_require(imports_versions) {
    const manifest = load_manifest();
    const os_ids = get_os_ids();
    const missing = {};

    for (const [lib, version] of Object.entries(imports_versions)) {
        if (!manifest[lib] || !manifest[lib][version]) {
            printerr(`Please add ${lib} ${version} to dependencies.json`);
            System.exit(1);
        }

        try {
            Gi.require(lib, version);
        } catch (ex) {
            missing[lib] = version;
            logError(ex);
        }
    }

    const { packages, unresolved } = resolve_packages(manifest, missing, os_ids);

    if (packages.size + unresolved.size !== 0) {
        show_notification(packages, unresolved);
        System.exit(1);
    }
}
