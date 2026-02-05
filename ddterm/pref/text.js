// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, ActionRow } from './util.js';

class FontRow extends ActionRow {
    static [GObject.GTypeName] = 'DDTermFontRow';

    static [GObject.properties] = {
        'font': GObject.ParamSpec.string(
            'font',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #button;

    constructor(params) {
        super(params);

        this.#button = new Gtk.FontButton({
            valign: Gtk.Align.CENTER,
            can_focus: false,
            visible: true,
        });

        if (!this.font)
            this.font = this.#button.font;

        this.bind_property(
            'font',
            this.#button,
            'font',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#button);

        if (this.add_suffix)
            this.add_suffix(this.#button);
        else
            this.add(this.#button);
    }
}

export class TextGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermTextPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    #font_row;

    constructor(params) {
        super(params);

        this.title = this.gettext('Text');

        this.add_switch_row({
            key: 'use-system-font',
            title: this.gettext('Use System Font'),
        });

        this.#font_row = new FontRow({
            title: this.gettext('Custom _Font'),
            visible: true,
            use_underline: true,
        });

        this.settings.bind(
            'custom-font',
            this.#font_row,
            'font',
            Gio.SettingsBindFlags.NO_SENSITIVITY
        );

        this.add(this.#font_row);

        this.add_combo_text_row({
            key: 'text-blink-mode',
            title: this.gettext('Allow _Blinking Text'),
            model: {
                never: this.gettext('Never'),
                focused: this.gettext('When focused'),
                unfocused: this.gettext('When unfocused'),
                always: this.gettext('Always'),
            },
        });

        this.add_combo_text_row({
            key: 'cursor-shape',
            title: this.gettext('Cursor _Shape'),
            model: {
                block: this.gettext('Block'),
                ibeam: this.gettext('I-Beam'),
                underline: this.gettext('Underline'),
            },
        });

        this.add_combo_text_row({
            key: 'cursor-blink-mode',
            title: this.gettext('_Cursor Blinking'),
            model: {
                system: this.gettext('Default'),
                on: this.gettext('Enabled'),
                off: this.gettext('Disabled'),
            },
        });

        this.add_switch_row({
            key: 'allow-hyperlink',
            title: this.gettext('Allow _Hyperlinks'),
        });

        this.add_switch_row({
            key: 'audible-bell',
            title: this.gettext('Audible _Bell'),
        });

        const url_detect_expander = this.add_expander_row({
            key: 'detect-urls',
            title: this.gettext('Detect _URLs'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-as-is',
            title: this.gettext('Detect Raw URLs (scheme://netloc/path)'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-file',
            title: this.gettext('Detect "file:" URLs'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-http',
            title: this.gettext('Detect HTTP URLs'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-voip',
            title: this.gettext('Detect VoIP URLs'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-email',
            title: this.gettext('Detect E-mail Addresses'),
        });

        url_detect_expander.add_switch_row({
            key: 'detect-urls-news-man',
            title: this.gettext('Detect "news:", "man:" URLs'),
        });

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const update_font_sensitivity = this.#update_font_sensitivity.bind(this);

        const settings_handlers = [
            this.settings.connect('writable-changed::custom-font', update_font_sensitivity),
            this.settings.connect('changed::use-system-font', update_font_sensitivity),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of settings_handlers)
                this.settings.disconnect(handler);
        });

        this.#update_font_sensitivity();
    }

    #update_font_sensitivity() {
        this.#font_row.sensitive = this.settings.is_writable('custom-font') &&
            !this.settings.get_boolean('use-system-font');
    }
}
