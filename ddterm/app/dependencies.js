// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
        } catch {
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
