/*
    Copyright © 2021 Aleksandr Mezin

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

/* exported PanelIconProxy */

const { GObject, Atk, Clutter, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { ConnectionSet } = Me.imports.connectionset;
const { translations } = Me.imports;

const PanelIconBase = GObject.registerClass(
    {
        Properties: {
            'active': GObject.ParamSpec.boolean(
                'active',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
        },
        Signals: {
            'toggle': {
                param_types: [GObject.TYPE_BOOLEAN],
            },
            'open-preferences': {},
        },
    },
    class DDTermPanelIconBase extends PanelMenu.Button {
        _init(dontCreateMenu) {
            super._init(null, 'ddterm', dontCreateMenu);

            this.connections = new ConnectionSet();

            this.add_actor(new St.Icon({
                icon_name: 'utilities-terminal',
                style_class: 'system-status-icon',
            }));

            this.add_style_class_name('panel-status-button');
        }
    }
);

const PanelIconPopupMenu = GObject.registerClass(
    class DDTermPanelIconPopupMenu extends PanelIconBase {
        _init() {
            super._init(false);

            this.toggle_item = new PopupMenu.PopupSwitchMenuItem(
                translations.gettext('Show'),
                false
            );
            this.menu.addMenuItem(this.toggle_item);
            this.connections.connect(this.toggle_item, 'toggled', (_, value) => {
                this.emit('toggle', value);
            });
            this.connections.connect(this.toggle_item, 'notify::state', () => {
                this.notify('active');
            });

            this.preferences_item = new PopupMenu.PopupMenuItem(
                translations.gettext('Preferences...')
            );
            this.menu.addMenuItem(this.preferences_item);
            this.connections.connect(this.preferences_item, 'activate', () => {
                this.emit('open-preferences');
            });
        }

        get active() {
            return this.toggle_item.state;
        }

        set active(value) {
            this.toggle_item.setToggleState(value);
        }

        static type_name() {
            return 'menu-button';
        }
    }
);

const PanelIconToggleButton = GObject.registerClass(
    class DDTermPanelIconToggleButton extends PanelIconBase {
        _init() {
            super._init(true);

            this.accessible_role = Atk.Role.TOGGLE_BUTTON;
        }

        get active() {
            return this.has_style_pseudo_class('active');
        }

        set active(value) {
            if (value === this.active)
                return;

            if (value) {
                this.add_style_pseudo_class('active');
                this.add_accessible_state(Atk.StateType.CHECKED);
            } else {
                this.remove_style_pseudo_class('active');
                this.remove_accessible_state(Atk.StateType.CHECKED);
            }

            this.notify('active');
        }

        static type_name() {
            return 'toggle-button';
        }

        vfunc_event(event) {
            if (event.type() === Clutter.EventType.BUTTON_PRESS ||
                event.type() === Clutter.EventType.TOUCH_BEGIN)
                this.emit('toggle', !this.active);

            return Clutter.EVENT_PROPAGATE;
        }
    }
);

var PanelIconProxy = GObject.registerClass(
    {
        Properties: {
            'active': GObject.ParamSpec.boolean(
                'active',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
            'type': GObject.ParamSpec.string(
                'type',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                'none'
            ),
        },
        Signals: {
            'toggle': {
                param_types: [GObject.TYPE_BOOLEAN],
            },
            'open-preferences': {},
        },
    },
    class DDTermPanelIconProxy extends GObject.Object {
        _init() {
            super._init();

            this.connections = new ConnectionSet();
            this.icon = null;
            this._active = false;

            this.types = {
                'none': null,
            };

            this.types[PanelIconPopupMenu.type_name()] = PanelIconPopupMenu;
            this.types[PanelIconToggleButton.type_name()] = PanelIconToggleButton;
        }

        get type() {
            if (this.icon === null)
                return 'none';

            return this.icon.type_name();
        }

        set type(value) {
            if (!this.types.hasOwnProperty(value))
                throw new Error(`${value} is not a vaild icon type`);

            const type_resolved = this.types[value];

            if (!type_resolved) {
                this.remove();
                return;
            }

            if (this.icon instanceof type_resolved)
                return;

            this._remove_no_notify();

            this.icon = new type_resolved();
            Main.panel.addToStatusArea('ddterm', this.icon);

            this.icon.active = this._active;

            this.connections.connect(this.icon, 'toggle', (_, v) => {
                this.emit('toggle', v);
            });
            this.connections.connect(this.icon, 'open-preferences', () => {
                this.emit('open-preferences');
            });

            this.notify('type');
        }

        get active() {
            return this._active;
        }

        set active(value) {
            if (value === this._active)
                return;

            this._active = value;

            if (this.icon)
                this.icon.active = value;

            this.notify('active');
        }

        _remove_no_notify() {
            this.connections.disconnect();

            if (!this.icon)
                return false;

            this.icon.connections.disconnect();
            this.icon.destroy();
            this.icon = null;

            return true;
        }

        remove() {
            if (this._remove_no_notify())
                this.notify('type');
        }
    }
);
