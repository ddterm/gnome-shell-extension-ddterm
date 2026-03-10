// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Vte from 'gi://Vte';

import Gettext from 'gettext';

import { SearchBar } from './search.js';
import { TabTitleDialog } from './tablabel.js';
import { Terminal, TerminalCommand, WIFEXITED, WEXITSTATUS, WTERMSIG } from './terminal.js';
import { TerminalSettings } from './terminalsettings.js';

class CloseDialog extends Gtk.MessageDialog {
    static [GObject.GTypeName] = 'DDTermPageCloseDialog';

    static [Gtk.template] =
        GLib.Uri.resolve_relative(import.meta.url, './ui/closedialog.ui', GLib.UriFlags.NONE);

    static {
        GObject.registerClass(this);
    }
}

const PAGE_ACTIONS = [
    'close_action',
    'keep_open_action',
    'new_tab_before_action',
    'new_tab_after_action',
    'move_prev_action',
    'move_next_action',
    'move_to_other_pane_action',
];

const TERMINAL_ACTIONS = [
    'copy_action',
    'copy_html_action',
    'open_hyperlink_action',
    'copy_hyperlink_action',
    'copy_filename_action',
    'paste_action',
    'select_all_action',
    'reset_action',
    'reset_and_clear_action',
    'find_action',
    'find_next_action',
    'find_prev_action',
    'font_scale_increase_action',
    'font_scale_decrease_action',
    'font_scale_reset_action',
    'show_in_file_manager_action',
];

export class TerminalPage extends Gtk.Box {
    static [GObject.GTypeName] = 'DDTermTerminalPage';

    static [Gtk.template] =
        GLib.Uri.resolve_relative(import.meta.url, './ui/terminalpage.ui', GLib.UriFlags.NONE);

    static [Gtk.children] = [
        'terminal',
    ];

    static [Gtk.internalChildren] = [
        'scrollbar',
        'search_bar',
        ...PAGE_ACTIONS,
        ...TERMINAL_ACTIONS,
    ];

    static [GObject.properties] = {
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'command': GObject.ParamSpec.object(
            'command',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalCommand
        ),
        'terminal-title': GObject.ParamSpec.string(
            'terminal-title',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'use-custom-title': GObject.ParamSpec.boolean(
            'use-custom-title',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'switch-shortcut': GObject.ParamSpec.string(
            'switch-shortcut',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
        'title': GObject.ParamSpec.string(
            'title',
            null,
            null,
            GObject.ParamFlags.READABLE,
            ''
        ),
        'keep-open-after-exit': GObject.ParamSpec.boolean(
            'keep-open-after-exit',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'split-layout': GObject.ParamSpec.string(
            'split-layout',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'no-split'
        ),
        'banner-label': GObject.ParamSpec.string(
            'banner-label',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'banner-type': GObject.ParamSpec.enum(
            'banner-type',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.MessageType,
            Gtk.MessageType.INFO
        ),
        'banner-visible': GObject.ParamSpec.boolean(
            'banner-visible',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static [GObject.signals] = {
        'new-tab-before-request': {},
        'new-tab-after-request': {},
        'move-prev-request': {},
        'move-next-request': {},
        'split-layout-request': {
            param_types: [String],
        },
        'move-to-other-pane-request': {},
        'close-request': {},
        'close-finish': {
            param_types: [Boolean],
        },
        'session-update': {},
    };

    static {
        GObject.type_ensure(Terminal);
        GObject.type_ensure(SearchBar);

        GObject.registerClass(this);
    }

    #title_binding = null;
    #title_dialog = null;

    constructor(params) {
        super(params);

        this.terminal_settings?.bind_terminal(this.terminal);

        this.connect('notify::terminal-title', () => this.notify('title'));
        this.connect('notify::switch-shortcut', () => this.notify('title'));

        this.terminal_settings?.bind_property(
            'show-scrollbar',
            this._scrollbar,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        const page_actions = new Gio.SimpleActionGroup();

        for (const name of PAGE_ACTIONS)
            page_actions.add_action(this[`_${name}`]);

        const split_layout_action = new Gio.SimpleAction({
            name: 'split-layout',
            parameter_type: new GLib.VariantType('s'),
            state: GLib.Variant.new_string(this.split_layout),
        });
        this.connect('notify::split-layout', () => {
            split_layout_action.state = GLib.Variant.new_string(this.split_layout);
        });
        split_layout_action.connect('change-state', (_, value) => {
            this.emit('split-layout-request', value.unpack());
        });
        split_layout_action.set_state_hint(new GLib.Variant('as', [
            'no-split',
            'horizontal-split',
            'vertical-split',
        ]));
        page_actions.add_action(split_layout_action);

        this.connect('notify::use-custom-title', () => {
            this.#update_title_binding();
        });
        // Don't update the title from the terminal until the process is started
        this.#update_title_binding(false);

        this.connect('destroy', () => {
            this.#title_dialog?.destroy();
        });

        const use_custom_title_action = new Gio.SimpleAction({
            'name': 'use-custom-title',
            'state': GLib.Variant.new_boolean(this.use_custom_title),
            'parameter-type': GLib.VariantType.new('b'),
        });
        use_custom_title_action.connect('change-state', (_, value) => {
            this.use_custom_title = value.get_boolean();
        });
        this.connect('notify::use-custom-title', () => {
            use_custom_title_action.set_state(
                GLib.Variant.new_boolean(this.use_custom_title)
            );
        });
        use_custom_title_action.connect('activate', (_, param) => {
            use_custom_title_action.change_state(param);

            if (param.get_boolean())
                this.#edit_title();
        });
        page_actions.add_action(use_custom_title_action);

        this.insert_action_group('page', page_actions);

        const terminal_actions = new Gio.SimpleActionGroup();

        this.terminal.bind_property_full(
            'last-clicked-hyperlink',
            this._open_hyperlink_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            (_, hyperlink) => [true, Boolean(hyperlink)],
            null
        );

        this.terminal.bind_property_full(
            'last-clicked-hyperlink',
            this._copy_hyperlink_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            (_, hyperlink) => [true, Boolean(hyperlink)],
            null
        );

        this.terminal.bind_property_full(
            'last-clicked-filename',
            this._copy_filename_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            (_, filename) => [true, Boolean(filename)],
            null
        );

        this.terminal.bind_property_full(
            'font-scale',
            this._font_scale_reset_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            (_, scale) => [true, scale !== 1],
            null
        );

        for (const name of TERMINAL_ACTIONS)
            terminal_actions.add_action(this[`_${name}`]);

        this.insert_action_group('terminal', terminal_actions);

        const emit_session_update = () => this.emit('session-update');

        this.connect('notify::banner-visible', emit_session_update);
        this.connect('notify::use-custom-title', emit_session_update);
        this.connect('notify::keep-open-after-exit', emit_session_update);
    }

    get_cwd() {
        return this.terminal.get_cwd();
    }

    _child_exited(terminal, status) {
        if (!this.keep_open_after_exit) {
            this.emit('close-request');
            return;
        }

        if (WIFEXITED(status)) {
            const code = WEXITSTATUS(status);

            this.banner_label = [
                Gettext.gettext('The child process exited with status:'),
                code,
            ].join(' ');

            this.banner_type = code === 0 ? Gtk.MessageType.INFO : Gtk.MessageType.WARNING;
            this.banner_visible = true;
        } else {
            const signum = WTERMSIG(status);

            this.banner_label = [
                Gettext.gettext('The child process was aborted by signal:'),
                signum,
                GLib.strsignal(signum),
            ].join(' ');

            this.banner_type = Gtk.MessageType.WARNING;
            this.banner_visible = true;
        }
    }

    _banner_response(banner, response) {
        switch (response) {
        case 0:
            this.banner_visible = false;
            this.spawn();
            break;
        case 1:
            this.emit('close-request');
            break;
        }
    }

    spawn(callback = null, timeout = -1) {
        if (!this.use_custom_title)
            this.terminal_title = this.command.title;

        const callback_wrapper = (...args) => {
            const [terminal_, pid_, error] = args;

            if (error) {
                this.banner_label = error.message;
                this.banner_type = Gtk.MessageType.ERROR;
                this.banner_visible = true;
            }

            callback?.(...args);
        };

        this.grab_focus();
        return this.terminal.spawn(this.command, timeout, callback_wrapper);
    }

    _open_hyperlink(source, param) {
        Gtk.show_uri_on_window(
            this.get_ancestor(Gtk.Window),
            param ?? this.terminal.last_clicked_hyperlink,
            Gdk.CURRENT_TIME
        );
    }

    _copy_hyperlink_action_activate() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_hyperlink, -1);
    }

    _copy_filename_action_activate() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_filename, -1);
    }

    _find_next() {
        this.terminal.search_set_regex(this._search_bar.pattern.regex, 0);
        this.terminal.search_set_wrap_around(this._search_bar.wrap);
        this.terminal.search_find_next();
    }

    _find_prev() {
        this.terminal.search_set_regex(this._search_bar.pattern.regex, 0);
        this.terminal.search_set_wrap_around(this._search_bar.wrap);
        this.terminal.search_find_previous();
    }

    _find_action_activate() {
        this.terminal.get_text_selected_async().then(text => {
            if (text)
                this._search_bar.pattern.text = text;

            this._search_bar.search_mode_enabled = true;
        });
    }

    _show_in_file_manager_action_activate() {
        const { current_file_uri } = this.terminal;
        const method = current_file_uri ? 'ShowItems' : 'ShowFolders';
        const uri = current_file_uri || this.get_cwd().get_uri();

        Gio.DBus.session.call(
            'org.freedesktop.FileManager1',
            '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1',
            method,
            GLib.Variant.new_tuple([
                GLib.Variant.new_array(new GLib.VariantType('s'), [GLib.Variant.new_string(uri)]),
                GLib.Variant.new_string(''),
            ]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            null
        );
    }

    _copy_action_activate() {
        this.terminal.copy_clipboard_format(Vte.Format.TEXT);
    }

    _copy_html_action_activate() {
        this.terminal.copy_clipboard_format(Vte.Format.HTML);
    }

    _paste_action_activate() {
        this.terminal.paste_clipboard();
    }

    _select_all_action_activate() {
        this.terminal.select_all();
    }

    _reset_action_activate() {
        this.terminal.reset(true, false);
    }

    _reset_and_clear_action_activate() {
        this.terminal.reset(true, true);
    }

    _font_scale_increase_action_activate() {
        this.terminal.increase_font_scale();
    }

    _font_scale_decrease_action_activate() {
        this.terminal.decrease_font_scale();
    }

    _font_scale_reset_action_activate() {
        this.terminal.font_scale = 1;
    }

    _new_tab_before_action_activate() {
        this.emit('new-tab-before-request');
    }

    _new_tab_after_action_activate() {
        this.emit('new-tab-after-request');
    }

    _move_prev_action_activate() {
        this.emit('move-prev-request');
    }

    _move_next_action_activate() {
        this.emit('move-next-request');
    }

    _move_to_other_pane_action_activate() {
        this.emit('move-to-other-pane-request');
    }

    _close_action_activate() {
        this.emit('close-request');
    }

    close() {
        if (!this.terminal.has_foreground_process()) {
            this.emit('close-finish', true);
            return;
        }

        const close_dialog = new CloseDialog({
            transient_for: this.get_toplevel(),
        });

        close_dialog.connect('response', (_, response_id) => {
            close_dialog.destroy();
            this.emit('close-finish', response_id === Gtk.ResponseType.ACCEPT);
        });

        close_dialog.show();
    }

    #update_title_binding(sync = true) {
        const flags = sync ? GObject.BindingFlags.SYNC_CREATE : GObject.BindingFlags.DEFAULT;
        const source = this.use_custom_title ? this.#title_dialog : this.terminal;
        const source_property = this.use_custom_title ? 'custom-title' : 'window-title';

        if ((this.#title_binding?.dup_source() ?? null) === (source ?? null))
            return;

        this.#title_binding?.unbind();
        this.#title_binding = source?.bind_property(source_property, this, 'terminal-title', flags);
    }

    #edit_title() {
        if (this.#title_dialog) {
            this.#title_dialog.present();
            return;
        }

        this.#title_dialog = new TabTitleDialog({
            transient_for: this.get_toplevel(),
            custom_title: this.terminal_title,
        });

        this.#title_dialog.connect('destroy', () => {
            this.#title_dialog = null;
        });

        this.bind_property(
            'use-custom-title',
            this.#title_dialog,
            'use-custom-title',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.#update_title_binding();
        this.#title_dialog.present();
    }

    get title() {
        if (this.switch_shortcut)
            return `${this.switch_shortcut} ${this.terminal_title}`;

        return this.terminal_title;
    }

    vfunc_grab_focus() {
        if (this._search_bar.search_mode_enabled)
            this._search_bar.grab_focus();
        else
            this.terminal.grab_focus();
    }

    serialize_state() {
        const properties = GLib.VariantDict.new(null);
        const cwd = this.get_cwd();
        const command = cwd ? this.command.override_working_directory(cwd) : this.command;

        properties.insert_value('command', command.to_gvariant());

        if (this.terminal_title)
            properties.insert_value('title', GLib.Variant.new_string(this.terminal_title));

        properties.insert_value(
            'use-custom-title',
            GLib.Variant.new_boolean(this.use_custom_title)
        );

        properties.insert_value(
            'keep-open-after-exit',
            GLib.Variant.new_boolean(this.keep_open_after_exit)
        );

        if (this.banner_visible) {
            properties.insert_value(
                'banner-type',
                GLib.Variant.new_int32(this.banner_type)
            );

            if (this.banner_label) {
                properties.insert_value(
                    'banner',
                    GLib.Variant.new_string(this.banner_label)
                );
            }
        }

        try {
            const text = this.terminal.get_text()?.trim();

            if (text)
                properties.insert_value('text', GLib.Variant.new_string(text));
        } catch (ex) {
            logError(ex, "Can't save terminal content");
        }

        return properties.end();
    }

    static deserialize_state(variant, properties) {
        const variant_dict_type = new GLib.VariantType('a{sv}');
        const dict = GLib.VariantDict.new(variant);
        const command_data = dict.lookup_value('command', variant_dict_type);
        const page = new TerminalPage({
            command: command_data ? TerminalCommand.from_gvariant(command_data) : null,
            terminal_title: dict.lookup('title', 's') ?? '',
            use_custom_title: dict.lookup('use-custom-title', 'b') ?? false,
            keep_open_after_exit: dict.lookup('keep-open-after-exit', 'b') ?? false,
            banner_label: dict.lookup('banner', 's') ?? '',
            banner_type: dict.lookup('banner-type', 'i') ?? Gtk.MessageType.INFO,
            banner_visible: dict.contains('banner-type'),
            ...properties,
        });

        try {
            const text = dict.lookup('text', 's');

            if (text)
                page.terminal.feed(`${text.replace(/\n/g, '\r\n')}\r\n`);
        } catch (ex) {
            logError(ex, "Can't restore terminal content");
        }

        return page;
    }
}
