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

import { SearchWidget } from './search.js';
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

function converter(func) {
    return (binding, value) => {
        try {
            return [true, func(value)];
        } catch (error) {
            logError(error);

            return [false, null];
        }
    };
}

function converter_method(func) {
    return (binding, value) => {
        try {
            return [true, func.call(value)];
        } catch (error) {
            logError(error);

            return [false, null];
        }
    };
}

function not_equal(a, b) {
    return a !== b;
}

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
        'search_widget',
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
        GObject.type_ensure(SearchWidget);

        GObject.registerClass(this);
    }

    #title_binding = null;
    #title_dialog = null;

    constructor(params) {
        super(params);

        this.connect('destroy', this.#destroy.bind(this));

        this.terminal_settings?.bind_terminal(this.terminal);

        this.connect('notify::terminal-title', this.#notify.bind(this, 'title'));
        this.connect('notify::switch-shortcut', this.#notify.bind(this, 'title'));

        this.connect('notify::use-custom-title', this.#update_title_binding.bind(this, true));
        // Don't update the title from the terminal until the process is started
        this.#update_title_binding(false);

        this.terminal_settings?.bind_property(
            'show-scrollbar',
            this._scrollbar,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        this._search_bar.connect_entry(this._search_widget.entry);

        const page_actions = new Gio.SimpleActionGroup();

        for (const action_name of [
            'close',
            'new-tab-before',
            'new-tab-after',
            'move-prev',
            'move-next',
            'move-to-other-pane',
        ]) {
            const action = Gio.SimpleAction.new(action_name, null);
            action.connect('activate', this.#emit_no_args.bind(this, `${action_name}-request`));
            page_actions.add_action(action);
        }

        const keep_open_action = new Gio.SimpleAction({
            name: 'keep-open-after-exit',
            state: GLib.Variant.new_boolean(this.keep_open_after_exit),
        });
        this.bind_property_full(
            'keep-open-after-exit',
            keep_open_action,
            'state',
            GObject.BindingFlags.BIDIRECTIONAL,
            converter(GLib.Variant.new_boolean),
            converter_method(GLib.Variant.prototype.get_boolean)
        );
        page_actions.add_action(keep_open_action);

        const split_layout_action = new Gio.SimpleAction({
            name: 'split-layout',
            parameter_type: new GLib.VariantType('s'),
            state: GLib.Variant.new_string(this.split_layout),
        });
        this.bind_property_full(
            'split-layout',
            split_layout_action,
            'state',
            GObject.BindingFlags.DEFAULT,
            converter(GLib.Variant.new_string),
            null
        );
        split_layout_action.connect('change-state', this.#split_layout.bind(this));
        split_layout_action.set_state_hint(new GLib.Variant('as', [
            'no-split',
            'horizontal-split',
            'vertical-split',
        ]));
        page_actions.add_action(split_layout_action);

        const use_custom_title_action = new Gio.SimpleAction({
            'name': 'use-custom-title',
            'state': GLib.Variant.new_boolean(this.use_custom_title),
            'parameter-type': GLib.VariantType.new('b'),
        });
        this.bind_property_full(
            'use-custom-title',
            use_custom_title_action,
            'state',
            GObject.BindingFlags.BIDIRECTIONAL,
            converter(GLib.Variant.new_boolean),
            converter_method(GLib.Variant.prototype.get_boolean)
        );
        use_custom_title_action.connect('activate', this.#use_custom_title.bind(this));
        page_actions.add_action(use_custom_title_action);

        this.insert_action_group('page', page_actions);

        const terminal_actions = new Gio.SimpleActionGroup();

        const copy_action = Gio.SimpleAction.new('copy', null);
        copy_action.connect('activate', this.#copy.bind(this));
        this.terminal.bind_property(
            'has-selection',
            copy_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(copy_action);

        const copy_html_action = Gio.SimpleAction.new('copy-html', null);
        copy_html_action.connect('activate', this.#copy_html.bind(this));
        this.terminal.bind_property(
            'has-selection',
            copy_html_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(copy_html_action);

        const open_hyperlink_action = Gio.SimpleAction.new('open-hyperlink', null);
        open_hyperlink_action.connect('activate', this._open_hyperlink.bind(this));
        this.terminal.bind_property_full(
            'last-clicked-hyperlink',
            open_hyperlink_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            converter(Boolean),
            null
        );
        terminal_actions.add_action(open_hyperlink_action);

        const copy_hyperlink_action = Gio.SimpleAction.new('copy-hyperlink', null);
        copy_hyperlink_action.connect('activate', this.#copy_hyperlink.bind(this));
        this.terminal.bind_property_full(
            'last-clicked-hyperlink',
            copy_hyperlink_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            converter(Boolean),
            null
        );
        terminal_actions.add_action(copy_hyperlink_action);

        const copy_filename_action = Gio.SimpleAction.new('copy-filename', null);
        copy_filename_action.connect('activate', this.#copy_filename.bind(this));
        this.terminal.bind_property_full(
            'last-clicked-filename',
            copy_filename_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            converter(Boolean),
            null
        );
        terminal_actions.add_action(copy_filename_action);

        const paste_action = Gio.SimpleAction.new('paste', null);
        paste_action.connect('activate', this.#paste.bind(this));
        terminal_actions.add_action(paste_action);

        const select_all_action = Gio.SimpleAction.new('select-all', null);
        select_all_action.connect('activate', this.#select_all.bind(this));
        terminal_actions.add_action(select_all_action);

        const reset_action = Gio.SimpleAction.new('reset', null);
        reset_action.connect('activate', this.#reset.bind(this));
        terminal_actions.add_action(reset_action);

        const reset_and_clear_action = Gio.SimpleAction.new('reset-and-clear', null);
        reset_and_clear_action.connect('activate', this.#reset_and_clear.bind(this));
        terminal_actions.add_action(reset_and_clear_action);

        const find_action = Gio.SimpleAction.new('find', null);
        find_action.connect('activate', this.#find.bind(this));
        terminal_actions.add_action(find_action);

        const find_next_action = Gio.SimpleAction.new('find-next', null);
        find_next_action.connect('activate', this._find_next.bind(this));
        this._search_bar.bind_property(
            'search-mode-enabled',
            find_next_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(find_next_action);

        const find_prev_action = Gio.SimpleAction.new('find-prev', null);
        find_prev_action.connect('activate', this._find_prev.bind(this));
        this._search_bar.bind_property(
            'search-mode-enabled',
            find_prev_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(find_prev_action);

        const font_scale_increase_action = Gio.SimpleAction.new('font-scale-increase', null);
        font_scale_increase_action.connect('activate', this.#font_scale_increase.bind(this));
        this.terminal.bind_property(
            'can-increase-font-scale',
            font_scale_increase_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(font_scale_increase_action);

        const font_scale_decrease_action = Gio.SimpleAction.new('font-scale-decrease', null);
        font_scale_decrease_action.connect('activate', this.#font_scale_decrease.bind(this));
        this.terminal.bind_property(
            'can-decrease-font-scale',
            font_scale_decrease_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        terminal_actions.add_action(font_scale_decrease_action);

        const font_scale_reset_action = Gio.SimpleAction.new('font-scale-reset', null);
        font_scale_reset_action.connect('activate', this.#font_scale_reset.bind(this));
        this.terminal.bind_property_full(
            'font-scale',
            font_scale_reset_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE,
            converter(not_equal.bind(globalThis, 1)),
            null
        );
        terminal_actions.add_action(font_scale_reset_action);

        const show_in_file_manager_action = Gio.SimpleAction.new('show-in-file-manager', null);
        show_in_file_manager_action.connect('activate', this.#show_in_file_manager.bind(this));
        terminal_actions.add_action(show_in_file_manager_action);

        this.insert_action_group('terminal', terminal_actions);

        const emit_session_update = this.#emit_no_args.bind(this, 'session-update');

        this.connect('notify::banner-visible', emit_session_update);
        this.connect('notify::use-custom-title', emit_session_update);
        this.connect('notify::keep-open-after-exit', emit_session_update);
    }

    get_cwd() {
        return this.terminal.get_cwd();
    }

    #destroy() {
        this.#title_dialog?.destroy();
    }

    #emit_no_args(signal_name) {
        return this.emit(signal_name);
    }

    #notify(property_name) {
        this.notify(property_name);
    }

    #split_layout(action, value) {
        this.emit('split-layout-request', value.unpack());
    }

    #use_custom_title(action, param) {
        action.change_state(param);

        if (param.get_boolean())
            this.#edit_title();
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

    #copy_hyperlink() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_hyperlink, -1);
    }

    #copy_filename() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_filename, -1);
    }

    _find_next() {
        this.terminal.search_set_regex(this._search_widget.pattern.regex, 0);
        this.terminal.search_set_wrap_around(this._search_widget.wrap);
        this.terminal.search_find_next();
    }

    _find_prev() {
        this.terminal.search_set_regex(this._search_widget.pattern.regex, 0);
        this.terminal.search_set_wrap_around(this._search_widget.wrap);
        this.terminal.search_find_previous();
    }

    #find() {
        this.terminal.get_text_selected_async().then(text => {
            if (text)
                this._search_widget.pattern.text = text;

            this._search_bar.search_mode_enabled = true;
        });
    }

    #show_in_file_manager() {
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

    #copy() {
        this.terminal.copy_clipboard_format(Vte.Format.TEXT);
    }

    #copy_html() {
        this.terminal.copy_clipboard_format(Vte.Format.HTML);
    }

    #paste() {
        this.terminal.paste_clipboard();
    }

    #select_all() {
        this.terminal.select_all();
    }

    #reset() {
        this.terminal.reset(true, false);
    }

    #reset_and_clear() {
        this.terminal.reset(true, true);
    }

    #font_scale_increase() {
        this.terminal.increase_font_scale();
    }

    #font_scale_decrease() {
        this.terminal.decrease_font_scale();
    }

    #font_scale_reset() {
        this.terminal.font_scale = 1;
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
