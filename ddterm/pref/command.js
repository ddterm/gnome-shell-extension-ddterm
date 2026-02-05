// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { PreferencesGroup, EntryRow } from './util.js';

export class CommandGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermCommandPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    #custom_command_entry;

    constructor(params) {
        super(params);

        this.title = this.gettext('Command');

        this.add_combo_text_row({
            key: 'command',
            title: this.gettext('Command'),
            model: {
                'user-shell': this.gettext('User shell'),
                'user-shell-login': this.gettext('User shell as login shell'),
                'custom-command': this.gettext('Custom command'),
            },
        });

        this.#custom_command_entry = new EntryRow({
            title: this.gettext('Custom Command'),
            visible: true,
            use_underline: true,
        });

        this.settings.bind(
            'custom-command',
            this.#custom_command_entry,
            'text',
            Gio.SettingsBindFlags.NO_SENSITIVITY
        );

        this.add(this.#custom_command_entry);

        this.add_switch_row({
            key: 'preserve-working-directory',
            title: this.gettext('Preserve Working Directory In New Tabs'),
        });

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const update_sensitivity = this.#update_sensitivity.bind(this);

        const settings_handlers = [
            this.settings.connect('writable-changed::custom-command', update_sensitivity),
            this.settings.connect('changed::command', update_sensitivity),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of settings_handlers)
                this.settings.disconnect(handler);
        });

        this.#update_sensitivity();
    }

    #update_sensitivity() {
        this.#custom_command_entry.sensitive = this.settings.is_writable('custom-command') &&
            this.settings.get_string('command') === 'custom-command';
    }
}
