// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, ComboTextItem } from './util.js';

export class CompatibilityGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermCompatibilityPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Compatibility');

        const model = ComboTextItem.create_list({
            'auto': this.gettext('Automatic'),
            'ascii-backspace': this.gettext('Control-H'),
            'ascii-delete': this.gettext('ASCII DEL'),
            'delete-sequence': this.gettext('Escape sequence'),
            'tty': this.gettext('TTY Erase'),
        });

        this.add_combo_text_row({
            key: 'backspace-binding',
            title: this.gettext('_Backspace Key Generates'),
            model,
        });

        this.add_combo_text_row({
            key: 'delete-binding',
            title: this.gettext('_Delete Key Generates'),
            model,
        });

        this.add_combo_text_row({
            key: 'cjk-utf8-ambiguous-width',
            title: this.gettext('Ambiguous-_Width Characters'),
            model: {
                narrow: this.gettext('Narrow'),
                wide: this.gettext('Wide'),
            },
        });

        const reset_button = new Gtk.Button({
            visible: true,
            label: this.gettext('_Reset Compatibility Options to Defaults'),
            use_underline: true,
        });

        reset_button.get_style_context().add_class('destructive-action');

        this.connect('realize', () => {
            const reset_handler = reset_button.connect('clicked', () => {
                this.settings.reset('backspace-binding');
                this.settings.reset('delete-binding');
                this.settings.reset('cjk-utf8-ambiguous-width');
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                reset_button.disconnect(reset_handler);
            });
        });

        this.add(reset_button);
    }
}
