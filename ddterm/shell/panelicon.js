// SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PanelIconBase = GObject.registerClass({
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
        'open-preferences': {},
    },
}, class DDTermPanelIconBase extends PanelMenu.Button {
    _init(dontCreateMenu, gettext_context) {
        super._init(null, gettext_context.gettext('ddterm'), dontCreateMenu);

        this.name = 'ddterm-panel-icon';

        this.add_child(new St.Icon({
            icon_name: 'utilities-terminal',
            style_class: 'system-status-icon',
        }));
    }
});

const PanelIconPopupMenu = GObject.registerClass({
}, class DDTermPanelIconPopupMenu extends PanelIconBase {
    _init(gettext_context) {
        super._init(false, gettext_context);

        this.toggle_item = new PopupMenu.PopupSwitchMenuItem(
            gettext_context.gettext('Show'),
            false
        );
        this.menu.addMenuItem(this.toggle_item);
        this.toggle_item.connect('toggled', () => {
            this.active = this.toggle_item.state;
        });
        this.connect('notify::active', () => {
            const value = this.active;

            if (this.toggle_item.state !== value)
                this.toggle_item.setToggleState(value);
        });

        this.preferences_item = new PopupMenu.PopupMenuItem(
            gettext_context.gettext('Preferences…')
        );
        this.menu.addMenuItem(this.preferences_item);
        this.preferences_item.connect('activate', () => {
            this.emit('open-preferences');
        });
    }

    static type_name() {
        return 'menu-button';
    }
});

const PanelIconToggleButton = GObject.registerClass({
}, class DDTermPanelIconToggleButton extends PanelIconBase {
    _init(gettext_context) {
        super._init(true, gettext_context);

        this.accessible_role = Atk.Role.TOGGLE_BUTTON;

        this.connect('notify::active', () => {
            this._update();
        });

        this._update();
    }

    _update() {
        if (this.active) {
            this.add_style_pseudo_class('active');
            this.add_accessible_state(Atk.StateType.CHECKED);
        } else {
            this.remove_style_pseudo_class('active');
            this.remove_accessible_state(Atk.StateType.CHECKED);
        }
    }

    static type_name() {
        return 'toggle-button';
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS ||
            event.type() === Clutter.EventType.TOUCH_BEGIN) {
            this.active = !this.active;
            return Clutter.EVENT_PROPAGATE;
        }

        return super.vfunc_event(event);
    }
});

const PanelIconToggleAndMenu = GObject.registerClass({
}, class DDTermPanelIconToggleAndMenu extends PanelIconPopupMenu {
    _init(gettext_context) {
        super._init(gettext_context);

        this.connect('notify::active', () => {
            this._update();
        });

        this._update();
    }

    _update() {
        if (this.active) {
            this.add_style_pseudo_class('checked');
            this.add_accessible_state(Atk.StateType.CHECKED);
        } else {
            this.remove_style_pseudo_class('checked');
            this.remove_accessible_state(Atk.StateType.CHECKED);
        }
    }

    static type_name() {
        return 'toggle-and-menu-button';
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_BEGIN ||
            event.type() === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === Clutter.BUTTON_PRIMARY ||
                event.get_button() === Clutter.BUTTON_MIDDLE) {
                this.active = !this.active;
                return Clutter.EVENT_PROPAGATE;
            }
        }

        return super.vfunc_event(event);
    }
});

const TYPE_BY_NAME = {
    'none': null,
    ...Object.fromEntries([
        PanelIconPopupMenu,
        PanelIconToggleButton,
        PanelIconToggleAndMenu,
    ].map(t => [t.type_name(), t])),
};

export const PanelIconProxy = GObject.registerClass({
    Properties: {
        'active': GObject.ParamSpec.boolean(
            'active',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'type-name': GObject.ParamSpec.string(
            'type-name',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'none'
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
    Signals: {
        'open-preferences': {},
    },
}, class DDTermPanelIconProxy extends GObject.Object {
    _init(params) {
        super._init(params);

        this.icon = null;
    }

    get type_name() {
        if (!this.icon)
            return 'none';

        return this.icon.type_name();
    }

    set type_name(value) {
        if (!TYPE_BY_NAME.hasOwnProperty(value))
            throw new Error(`${value} is not a vaild icon type`);

        const type_resolved = TYPE_BY_NAME[value];

        if (type_resolved) {
            if (this.icon instanceof type_resolved)
                return;
        } else if (this.icon === null) {
            return;
        }

        this.freeze_notify();

        try {
            this.remove();

            if (!type_resolved)
                return;

            this.icon = new type_resolved(this.gettext_context);
            Main.panel.addToStatusArea('ddterm', this.icon);

            this.bind_property(
                'active',
                this.icon,
                'active',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            );

            this.icon.connect('open-preferences', () => {
                this.emit('open-preferences');
            });
        } finally {
            this.thaw_notify();
        }
    }

    remove() {
        this.icon?.destroy();
        this.icon = null;
        this.notify('type-name');
    }
});
