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

const { GLib, GObject, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;
const { prefsutil, rxutil, settings, translations } = Me.imports;

class DisplayConfig {
    constructor() {
        this.proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            null
        );

        this.config = rxutil.signal(this.proxy, 'g-signal').pipe(
            rxjs.filter(
                ([_proxy, _sender, signal_name]) => signal_name === 'MonitorsChanged'
            ),
            rxjs.startWith([this.proxy]),
            rxjs.switchMap(([proxy]) => {
                return new rxjs.Observable(observer => {
                    const cancellable = Gio.Cancellable.new();

                    proxy.call(
                        'GetCurrentState',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        cancellable,
                        (source, res) => {
                            try {
                                observer.next(source.call_finish(res).unpack());
                                observer.complete();
                            } catch (ex) {
                                observer.error(ex);
                            }
                        }
                    );

                    return () => cancellable.cancel();
                });
            }),
            settings.share()
        );

        this.monitors = this.config.pipe(
            rxjs.map(([_serial, monitor_list]) => Object.fromEntries(
                monitor_list.unpack().map(monitor => {
                    const [ids, modes_, props] = monitor.unpack();
                    const [connector, vendor_, model, monitor_serial_] = ids.deep_unpack();
                    let display_name = props.deep_unpack()['display-name'];

                    if (display_name instanceof GLib.Variant)
                        display_name = display_name.unpack();

                    return [connector, `${display_name} - ${model} (${connector})`];
                })
            ))
        );
    }
}

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsPositionSize',
        Template:
            Me.dir.get_child(`prefs-position-size-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'monitor_combo',
            'window_pos_combo',
            'window_size_scale',
        ],
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                settings.Settings
            ),
        },
    },
    class PrefsPositionSize extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = prefsutil.scope(this, this.settings);

            scope.subscribe(new DisplayConfig().monitors, monitors => {
                this.monitor_combo.freeze_notify();

                try {
                    this.monitor_combo.remove_all();

                    for (let monitor of Object.entries(monitors))
                        this.monitor_combo.append(...monitor);

                    this.monitor_combo.active_id = this.settings['window-monitor-connector'].value;
                } finally {
                    this.monitor_combo.thaw_notify();
                }
            });

            scope.setup_widgets({
                'window-monitor-connector': this.monitor_combo,
                'window-position': this.window_pos_combo,
                'window-size': this.window_size_scale,
            });

            /*
                GtkRadioButton: always build the group around the last one.
                I. e. 'group' property of all buttons (except the last one)
                should point to the last one. Otherwise, settings-based action
                won't work correctly on Gtk 3.
            */
            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'window-monitor',
                ])
            );

            scope.set_scale_value_formatter(
                this.window_size_scale,
                prefsutil.percent_formatter
            );
        }

        get title() {
            return translations.gettext('Position and Size');
        }
    }
);

/* exported Widget */
