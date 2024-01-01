/*
    Copyright © 2023 Aleksandr Mezin

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

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

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

const Page = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class DDTermPrefsPage extends Adw.PreferencesPage {
    add_widget(widget_type) {
        const widget = new widget_type({
            settings: this.settings,
            gettext_context: this.gettext_context,
        });

        const group = new Adw.PreferencesGroup({
            title: widget.title,
        });

        group.add(widget);
        this.add(group);
    }
});

export const WindowPage = GObject.registerClass({
}, class DDTermWindowPrefsPage extends Page {
    _init(params) {
        super._init({
            name: 'window',
            icon_name: 'preferences-desktop-display',
            ...params,
        });

        this.title = this.gettext_context.gettext('Window');

        [
            PositionSizeWidget,
            BehaviorWidget,
            AnimationWidget,
            TabsWidget,
        ].forEach(widget_type => this.add_widget(widget_type));
    }
});

export const TerminalPage = GObject.registerClass({
}, class DDTermTerminalPrefsPage extends Page {
    _init(params) {
        super._init({
            name: 'terminal',
            icon_name: 'utilities-terminal',
            ...params,
        });

        this.title = this.gettext_context.gettext('Terminal');

        [
            TextWidget,
            ColorsWidget,
            CommandWidget,
            ScrollingWidget,
            CompatibilityWidget,
        ].forEach(widget_type => this.add_widget(widget_type));
    }
});

export const ShortcutsPage = GObject.registerClass({
}, class DDTermShortcutsPrefsPage extends Page {
    _init(params) {
        super._init({
            name: 'shortcuts',
            icon_name: 'preferences-desktop-keyboard-shortcuts',
            ...params,
        });

        this.title = this.gettext_context.gettext('Keyboard Shortcuts');

        this.add_widget(ShortcutsWidget);
    }
});

export const MiscPage = GObject.registerClass({
}, class DDTermMiscPrefsPage extends Page {
    _init(params) {
        super._init({
            name: 'misc',
            icon_name: 'preferences-other',
            ...params,
        });

        this.title = this.gettext_context.gettext('Miscellaneous');

        this.add_widget(PanelIconWidget);
    }
});
