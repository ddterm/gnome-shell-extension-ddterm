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

'use strict';

const ByteArray = imports.byteArray;
const System = imports.system;

const { GLib, Gio } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const APP_DIR = Me.dir.get_child('ddterm').get_child('app');

var MANIFEST_FILE = APP_DIR.get_child('dependencies.json');
/* exported MANIFEST_FILE */

const NOTIFICATION_HELPER = APP_DIR.get_child('dependencies-notification.js');

function get_os_ids() {
    const res = [GLib.get_os_info('ID')];
    const fallback = GLib.get_os_info('ID_LIKE');

    if (fallback)
        res.push(...fallback.split(' '));

    return res;
}

/* exported get_os_ids */

function load_manifest() {
    return JSON.parse(
        ByteArray.toString(
            MANIFEST_FILE.load_contents(null)[1]
        )
    );
}

/* exported load_manifest */

function resolve_package(distros, os_ids) {
    if (!distros)
        return null;

    for (const os of os_ids) {
        const match = distros[os];

        if (match)
            return match;
    }

    return null;
}

/* exported resolve_package */

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

function show_notification(packages, filenames) {
    const cmd = [NOTIFICATION_HELPER.get_path()];

    for (const pkg of packages)
        cmd.push('--package', pkg);

    for (const filename of filenames)
        cmd.push('--file', filename);

    const proc = Gio.Subprocess.new(cmd, Gio.SubprocessFlags.NONE);

    if (!ARGV.includes('--attach-unit'))
        return;

    const pid = parseInt(proc.get_identifier(), 10);

    Gio.DBus.session.call_sync(
        'org.freedesktop.systemd1',
        '/org/freedesktop/systemd1',
        'org.freedesktop.systemd1.Manager',
        'StartTransientUnit',
        GLib.Variant.new_tuple([
            GLib.Variant.new_string(`com.github.amezin.ddterm.deps-${pid}.scope`),
            GLib.Variant.new_string('fail'),
            GLib.Variant.new_array(
                new GLib.VariantType('(sv)'),
                [
                    GLib.Variant.new_tuple([
                        GLib.Variant.new_string('PIDs'),
                        GLib.Variant.new_variant(
                            GLib.Variant.new_array(
                                new GLib.VariantType('u'),
                                [GLib.Variant.new_uint32(pid)]
                            )
                        ),
                    ]),
                    GLib.Variant.new_tuple([
                        GLib.Variant.new_string('CollectMode'),
                        GLib.Variant.new_variant(
                            GLib.Variant.new_string('inactive-or-failed')
                        ),
                    ]),
                ]
            ),
            GLib.Variant.new_array(
                new GLib.VariantType('(sa(sv))'),
                []
            ),
        ]),
        null,
        Gio.DBusCallFlags.NO_AUTO_START,
        -1,
        null
    );
}

function gi_require(imports_versions) {
    const manifest = load_manifest();
    const os_ids = get_os_ids();
    const missing = {};

    for (const [lib, version] of Object.entries(imports_versions)) {
        if (!manifest[lib] || !manifest[lib][version]) {
            printerr(`Please add ${lib} ${version} to packagekit.json`);
            System.exit(1);
        }

        imports.gi.versions[lib] = version;

        try {
            const _ = imports.gi[lib];
        } catch (ex) {
            missing[lib] = version;
            logError(ex, `Failed to import library ${lib}, version ${version}`);
        }
    }

    const { packages, unresolved } = resolve_packages(manifest, missing, os_ids);

    if (packages.size + unresolved.size !== 0) {
        show_notification(packages, unresolved);
        System.exit(1);
    }
}

/* exported gi_require */
