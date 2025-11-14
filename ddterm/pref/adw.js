// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { AnimationGroup } from './animation.js';
import { BehaviorGroup } from './behavior.js';
import { ColorsWidget } from './colors.js';
import { CommandWidget } from './command.js';
import { CompatibilityWidget } from './compatibility.js';
import { PanelIconGroup } from './panelicon.js';
import { PositionSizeGroup } from './positionsize.js';
import { ScrollingWidget } from './scrolling.js';
import { GlobalShortcutGroup, ApplicationShortcutGroup, ResetShortcutsGroup } from './shortcuts.js';
import { TabsGroup } from './tabs.js';
import { TextWidget } from './text.js';
import { PreferencesPage } from './util.js';
import { DisplayConfig } from '../util/displayconfig.js';

class WindowPage extends PreferencesPage {
    static [GObject.GTypeName] = 'DDTermWindowPreferencesPage';

    static [GObject.properties] = {
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            name: 'window',
            icon_name: 'preferences-desktop-display',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Window');

        const { settings, gettext_domain } = this;

        this.add(new PositionSizeGroup({ settings, gettext_domain, monitors: this.monitors }));
        this.add(new BehaviorGroup({ settings, gettext_domain }));
        this.add(new AnimationGroup({ settings, gettext_domain }));
        this.add(new TabsGroup({ settings, gettext_domain }));
    }
}

class TerminalPage extends PreferencesPage {
    static [GObject.GTypeName] = 'DDTermTerminalPreferencesPage';

    static {
        GObject.registerClass(this);
    }

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
}

class ShortcutsPage extends PreferencesPage {
    static [GObject.GTypeName] = 'DDTermShortcutsPreferencesPage';

    static [GObject.signals] = {
        'accelerator-set': {
            param_types: [GObject.TYPE_UINT, Gdk.ModifierType],
        },
        'reset': {},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            name: 'shortcuts',
            icon_name: 'preferences-desktop-keyboard-shortcuts',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Keyboard Shortcuts');

        const { settings, gettext_domain } = this;

        this.#add_group(new GlobalShortcutGroup({ settings, gettext_domain }));
        this.#add_group(new ApplicationShortcutGroup({ settings, gettext_domain }));

        const reset_group = new ResetShortcutsGroup({ settings, gettext_domain });

        this.connect('realize', () => {
            const reset_handler = reset_group.connect('reset', () => {
                this.emit('reset');
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                reset_group.disconnect(reset_handler);
            });
        });

        this.add(reset_group);
    }

    #add_group(group) {
        const conflict_handler = this.connect('accelerator-set', (self, keyval, modifiers) => {
            group.emit('accelerator-set', keyval, modifiers);
        });

        this.connect('realize', () => {
            const accelerator_set_handler = group.connect(
                'accelerator-set',
                (_, keyval, modifiers) => {
                    GObject.signal_handler_block(this, conflict_handler);
                    this.emit('accelerator-set', keyval, modifiers);
                    GObject.signal_handler_unblock(this, conflict_handler);
                }
            );

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                group.disconnect(accelerator_set_handler);
            });
        });

        this.connect('reset', () => {
            group.emit('reset');
        });

        this.add(group);
    }
}

class MiscPage extends PreferencesPage {
    static [GObject.GTypeName] = 'DDTermMiscPreferencesPage';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            name: 'misc',
            icon_name: 'preferences-other',
            ...params,
        });

        this.title = this.gettext_domain.gettext('Miscellaneous');

        const { settings, gettext_domain } = this;

        this.add(new PanelIconGroup({ settings, gettext_domain }));
    }
}

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
