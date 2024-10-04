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

import { create_extension_dbus_proxy_oneshot } from './extensiondbus.js';
import { get_resource_file, get_resource_text } from './resources.js';

export const manifest_file = get_resource_file('dependencies.json');
export const manifest = JSON.parse(get_resource_text(manifest_file));

export function get_os_ids() {
    const res = [GLib.get_os_info('ID')];

    for (const id_like of GLib.get_os_info('ID_LIKE')?.split(' ') ?? []) {
        if (id_like)
            res.push(id_like);
    }

    if (res.includes('ubuntu') && !res.includes('debian'))
        res.push('debian');

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

export function gi_require_optional(imports_versions) {
    const os_ids = get_os_ids();
    const loaded = {};
    const missing = [];
    const unresolved = [];

    for (const [lib, version] of Object.entries(imports_versions)) {
        const version_manifest = manifest[lib]?.[version];

        if (!version_manifest)
            throw new Error(`Please add ${lib} ${version} to dependencies.json`);

        try {
            loaded[lib] = Gi.require(lib, version);
        } catch (ex) {
            const pkg = resolve_package(version_manifest, os_ids);

            if (pkg)
                missing.push(pkg);
            else
                unresolved.push(version_manifest.filename);
        }
    }

    if (missing.length === 0 && unresolved.length === 0)
        return loaded;

    const message_lines = [
        Gettext.gettext('ddterm needs additional packages to run'),
    ];

    if (missing.length > 0) {
        message_lines.push(
            Gettext.gettext('Please install the following packages:'),
            missing.join(' ')
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
        create_extension_dbus_proxy_oneshot().MissingDependenciesSync(missing, unresolved);
    } catch (ex) {
        logError(ex);
    }

    return loaded;
}

class MissingDependenciesError extends Error {
    constructor(message) {
        super(message);

        this.name = 'MissingDependenciesError';
    }
}

export function gi_require(imports_versions) {
    const loaded = gi_require_optional(imports_versions);

    if (Object.getOwnPropertyNames(loaded).length !==
        Object.getOwnPropertyNames(imports_versions).length)
        throw new MissingDependenciesError();

    return loaded;
}
