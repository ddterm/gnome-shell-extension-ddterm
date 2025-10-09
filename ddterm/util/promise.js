// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export async function wait_timeout(message, timeout_ms, cancellable = null) {
    let source, cancel_handler;

    try {
        await new Promise(resolve => {
            source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout_ms, () => {
                resolve();
                return GLib.SOURCE_CONTINUE;
            });

            cancel_handler = cancellable?.connect(() => {
                resolve();
            });
        });
    } finally {
        GLib.Source.remove(source);
    }

    cancellable?.disconnect(cancel_handler);
    cancellable?.set_error_if_cancelled();

    throw GLib.Error.new_literal(Gio.io_error_quark(), Gio.IOErrorEnum.TIMED_OUT, message);
}

export async function wait_property(object, property, predicate, cancellable = null) {
    let value = object[property];

    if (predicate(value))
        return value;

    let handler, cancel_handler;

    try {
        await new Promise((resolve, reject) => {
            handler = object.connect(`notify::${property}`, () => {
                try {
                    value = object[property];

                    if (predicate(value))
                        resolve();
                } catch (error) {
                    reject(error);
                }
            });

            cancel_handler = cancellable?.connect(() => {
                resolve();
            });
        });
    } finally {
        object.disconnect(handler);
        cancellable?.disconnect(cancel_handler);
    }

    cancellable?.set_error_if_cancelled();

    return value;
}
