// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { AnimationWidget } from './animation.js';
import { BehaviorWidget } from './behavior.js';
import { ColorsWidget } from './colors.js';
import { CommandWidget } from './command.js';
import { CompatibilityWidget } from './compatibility.js';
import { PanelIconWidget } from './panelicon.js';
import { PositionSizeWidget } from './positionsize.js';
import { ScrollingWidget } from './scrolling.js';
import { ShortcutsWidget } from './shortcuts.js';
import { TabsWidget } from './tabs.js';
import { TextWidget } from './text.js';
import { DisplayConfig } from '../util/displayconfig.js';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');
const { PreferencesGroup, PreferencesPage } = AdwOrHdy;

const Page = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class DDTermPrefsPage extends PreferencesPage {
    constructor(params) {
        super({
            visible: true,
            ...params,
        });
    }

    add_widget(widget_type, extra_properties = {}) {
        const widget = new widget_type({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            visible: true,
            ...extra_properties,
        });

        const group = new PreferencesGroup({
            title: widget.title,
            visible: true,
        });

        group.add(widget);
        this.add(group);

        return widget;
    }
});

const WindowPage = GObject.registerClass({
    Properties: {
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
    },
}, class DDTermWindowPrefsPage extends Page {
    constructor(params) {
        super({
            name: 'window',
            icon_name: 'preferences-desktop-display',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Window');

        this.add_widget(PositionSizeWidget, { monitors: this.monitors });
        this.add_widget(BehaviorWidget);
        this.add_widget(AnimationWidget);
        this.add_widget(TabsWidget);
    }
});

const TerminalPage = GObject.registerClass({
}, class DDTermTerminalPrefsPage extends Page {
    constructor(params) {
        super({
            name: 'terminal',
            icon_name: 'utilities-terminal',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Terminal');

        this.add_widget(TextWidget);
        this.add_widget(ColorsWidget);
        this.add_widget(CommandWidget);
        this.add_widget(ScrollingWidget);
        this.add_widget(CompatibilityWidget);
    }
});

const ShortcutsPage = GObject.registerClass({
}, class DDTermShortcutsPrefsPage extends Page {
    constructor(params) {
        super({
            name: 'shortcuts',
            icon_name: 'preferences-desktop-keyboard-shortcuts',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Keyboard Shortcuts');

        this.add_widget(ShortcutsWidget);
    }
});

const MiscPage = GObject.registerClass({
}, class DDTermMiscPrefsPage extends Page {
    constructor(params) {
        super({
            name: 'misc',
            icon_name: 'preferences-other',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Miscellaneous');

        this.add_widget(PanelIconWidget);
    }
});

export function fill_preferences_window(win, settings, gettext_domain, display_config = null) {
    if (!display_config) {
        display_config = DisplayConfig.new();

        if (Gtk.get_major_version() === 3) {
            win.connect('destroy', () => {
                display_config.unwatch();
            });
        } else {
            win.connect('close-request', () => {
                display_config.unwatch();
                return false;
            });
        }
    }

    win.add(new WindowPage({
        settings,
        gettext_domain,
        monitors: display_config.create_monitor_list(),
    }));

    win.add(new TerminalPage({ settings, gettext_domain }));
    win.add(new ShortcutsPage({ settings, gettext_domain }));
    win.add(new MiscPage({ settings, gettext_domain }));
}
