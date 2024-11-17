#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { manifest, get_os_ids, resolve_package } from '../../app/dependencies.js';

const vte_ver = Object.keys(manifest.Vte)[0];
const vte_manifest = manifest.Vte[vte_ver];
const vte_pkg = resolve_package(vte_manifest, get_os_ids());

Gio.DBus.session.call_sync(
    'org.gnome.Shell',
    '/org/gnome/Shell/Extensions/ddterm',
    'com.github.amezin.ddterm.Extension',
    'MissingDependencies',
    new GLib.Variant('(asas)', [[vte_pkg], [vte_manifest.filename]]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null
);
