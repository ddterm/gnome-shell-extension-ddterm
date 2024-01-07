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

import Gettext from 'gettext';
import Gi from 'gi';
import System from 'system';

import { create_extension_dbus_proxy } from './extensiondbus.js';
import { get_resource_file, get_resource_text } from './resources.js';

export const manifest_file = get_resource_file('dependencies.json');
export const manifest = JSON.parse(get_resource_text(manifest_file));

export function get_os_ids() {
    const res = [GLib.get_os_info('ID')];
    const fallback = GLib.get_os_info('ID_LIKE');

    if (fallback)
        res.push(...fallback.split(' '));

    if (res.includes('alpine') && !res.includes('arch'))
        res.push('arch');

    if (res.includes('ubuntu') && !res.includes('debian'))
        res.push('debian');

    if (res.includes('rhel') || res.includes('centos')) {
        if (!res.includes('fedora'))
            res.push('fedora');
    }

    return res;
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

function resolve_packages(lib_versions, os_ids) {
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

    return { packages: Array.from(packages), unresolved: Array.from(unresolved) };
}

export function gi_require(imports_versions) {
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
        }
    }

    const { packages, unresolved } = resolve_packages(missing, os_ids);

    if (packages.length === 0 && unresolved.length === 0)
        return;

    const message_lines = [
        Gettext.gettext('ddterm needs additional packages to run.'),
    ];

    if (packages.length > 0) {
        message_lines.push(
            Gettext.gettext('Please install the following packages:'),
            packages.join(' ')
        );
    }

    if (unresolved.length > 0) {
        message_lines.push(
            Gettext.gettext('Please install packages that provide the following files:'),
            unresolved.join(' ')
        );
    }

    printerr(message_lines.join('\n'));

    try {
        create_extension_dbus_proxy().MissingDependenciesSync(packages, unresolved);
    } catch (ex) {
        logError(ex);
    }

    System.exit(1);
}
