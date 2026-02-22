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

GObject.type_ensure(Terminal);
GObject.type_ensure(SearchBar);

const CloseDialog = GObject.registerClass({
    Template: GLib.Uri.resolve_relative(import.meta.url, './ui/closedialog.ui', GLib.UriFlags.NONE),
}, class DDTermCloseDialog extends Gtk.MessageDialog {
});

export const TerminalPage = GObject.registerClass({
    Template: GLib.Uri.resolve_relative(
        import.meta.url,
        './ui/terminalpage.ui',
        GLib.UriFlags.NONE
    ),
    Children: [
        'terminal',
        'scrollbar',
        'search_bar',
    ],
    InternalChildren: [
        'banner',
        'banner_label',
    ],
    Properties: {
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'terminal-menu': GObject.ParamSpec.object(
            'terminal-menu',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.MenuModel
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
            ''
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
    },
    Signals: {
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
    },
}, class DDTermTerminalPage extends Gtk.Box {
    _init(params) {
        super._init(params);

        this.orientation = Gtk.Orientation.VERTICAL;

        this.bind_property(
            'banner-label',
            this._banner_label,
            'label',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.bind_property(
            'banner-type',
            this._banner,
            'message-type',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.bind_property(
            'banner-visible',
            this._banner,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'banner-visible',
            this._banner,
            'revealed',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this._banner.connect('response', (_, response) => {
            switch (response) {
            case 0:
                this.banner_visible = false;
                this.spawn();
                break;
            case 1:
                this.emit('close-request');
                break;
            }
        });

        this.terminal.context_menu_model = this.terminal_menu;

        this.terminal_settings.bind_terminal(this.terminal);

        this.scrollbar.adjustment = this.terminal.vadjustment;

        this.search_bar.connect('notify::wrap', () => {
            this.terminal.search_set_wrap_around(this.search_bar.wrap);
        });

        this.terminal.search_set_wrap_around(this.search_bar.wrap);

        this.search_bar.connect('notify::reveal-child', () => {
            if (!this.search_bar.reveal_child)
                this.terminal.grab_focus();
        });

        this.connect('notify::terminal-title', () => this.notify('title'));
        this.connect('notify::switch-shortcut', () => this.notify('title'));

        this.terminal_settings.bind_property(
            'show-scrollbar',
            this.scrollbar,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        const page_actions = new Gio.SimpleActionGroup();

        const close_action = new Gio.SimpleAction({ name: 'close' });
        close_action.connect('activate', () => this.emit('close-request'));
        page_actions.add_action(close_action);

        const keep_open_action = new Gio.PropertyAction({
            name: 'keep-open-after-exit',
            object: this,
            property_name: 'keep-open-after-exit',
        });
        page_actions.add_action(keep_open_action);

        const new_tab_before_action = new Gio.SimpleAction({ name: 'new-tab-before' });
        new_tab_before_action.connect('activate', () => this.emit('new-tab-before-request'));
        page_actions.add_action(new_tab_before_action);

        const new_tab_after_action = new Gio.SimpleAction({ name: 'new-tab-after' });
        new_tab_after_action.connect('activate', () => this.emit('new-tab-after-request'));
        page_actions.add_action(new_tab_after_action);

        const move_prev_action = new Gio.SimpleAction({ name: 'move-prev' });
        move_prev_action.connect('activate', () => this.emit('move-prev-request'));
        page_actions.add_action(move_prev_action);

        const move_next_action = new Gio.SimpleAction({ name: 'move-next' });
        move_next_action.connect('activate', () => this.emit('move-next-request'));
        page_actions.add_action(move_next_action);

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

        const move_to_other_pane_action = new Gio.SimpleAction({ name: 'move-to-other-pane' });
        move_to_other_pane_action.connect('activate', () => {
            this.emit('move-to-other-pane-request');
        });
        page_actions.add_action(move_to_other_pane_action);

        this._title_binding = null;
        this.connect('notify::use-custom-title', () => {
            this.update_title_binding();
        });
        // Don't update the title from the terminal until the process is started
        this.update_title_binding(false);

        this._title_dialog = null;
        this.connect('destroy', () => {
            this._title_dialog?.destroy();
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
                this.edit_title();
        });
        page_actions.add_action(use_custom_title_action);

        this.insert_action_group('page', page_actions);

        const terminal_actions = new Gio.SimpleActionGroup();

        const copy_action = new Gio.SimpleAction({
            name: 'copy',
            enabled: this.terminal.get_has_selection(),
        });
        copy_action.connect('activate', () => {
            this.terminal.copy_clipboard_format(Vte.Format.TEXT);
        });
        terminal_actions.add_action(copy_action);

        const copy_html_action = new Gio.SimpleAction({
            name: 'copy-html',
            enabled: this.terminal.get_has_selection(),
        });
        copy_html_action.connect('activate', () => {
            this.terminal.copy_clipboard_format(Vte.Format.HTML);
        });
        terminal_actions.add_action(copy_html_action);

        this.terminal.connect('selection-changed', () => {
            copy_action.enabled = this.terminal.get_has_selection();
            copy_html_action.enabled = this.terminal.get_has_selection();
        });

        const open_hyperlink_action = new Gio.SimpleAction({
            name: 'open-hyperlink',
            enabled: this.terminal.last_clicked_hyperlink !== null,
        });
        open_hyperlink_action.connect('activate', this.open_hyperlink.bind(this));
        terminal_actions.add_action(open_hyperlink_action);

        const copy_hyperlink_action = new Gio.SimpleAction({
            name: 'copy-hyperlink',
            enabled: this.terminal.last_clicked_hyperlink !== null,
        });
        copy_hyperlink_action.connect('activate', this.copy_hyperlink.bind(this));
        terminal_actions.add_action(copy_hyperlink_action);

        this.terminal.connect('notify::last-clicked-hyperlink', () => {
            const enable = this.terminal.last_clicked_hyperlink !== null;
            open_hyperlink_action.enabled = enable;
            copy_hyperlink_action.enabled = enable;
        });

        const copy_filename_action = new Gio.SimpleAction({
            name: 'copy-filename',
            enabled: this.terminal.last_clicked_filename !== null,
        });
        copy_filename_action.connect('activate', this.copy_filename.bind(this));
        terminal_actions.add_action(copy_filename_action);

        this.terminal.connect('notify::last-clicked-filename', () => {
            const enable = this.terminal.last_clicked_filename !== null;
            copy_filename_action.enabled = enable;
        });

        const paste_action = new Gio.SimpleAction({ name: 'paste' });
        paste_action.connect('activate', () => {
            this.terminal.paste_clipboard();
        });
        terminal_actions.add_action(paste_action);

        const select_all_action = new Gio.SimpleAction({ name: 'select-all' });
        select_all_action.connect('activate', () => {
            this.terminal.select_all();
        });
        terminal_actions.add_action(select_all_action);

        const reset_action = new Gio.SimpleAction({ name: 'reset' });
        reset_action.connect('activate', () => {
            this.terminal.reset(true, false);
        });
        terminal_actions.add_action(reset_action);

        const reset_and_clear_action = new Gio.SimpleAction({ name: 'reset-and-clear' });
        reset_and_clear_action.connect('activate', () => {
            this.terminal.reset(true, true);
        });
        terminal_actions.add_action(reset_and_clear_action);

        const find_action = new Gio.SimpleAction({ name: 'find' });
        find_action.connect('activate', this.find.bind(this));
        terminal_actions.add_action(find_action);

        const find_next_action = new Gio.SimpleAction({ name: 'find-next' });
        find_next_action.connect('activate', this.find_next.bind(this));
        terminal_actions.add_action(find_next_action);

        const find_prev_action = new Gio.SimpleAction({ name: 'find-prev' });
        find_prev_action.connect('activate', this.find_prev.bind(this));
        terminal_actions.add_action(find_prev_action);

        [
            find_next_action,
            find_prev_action,
        ].forEach(action => this.search_bar.bind_property(
            'reveal-child',
            action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        ));

        const font_scale_increase_action = new Gio.SimpleAction({
            name: 'font-scale-increase',
        });
        font_scale_increase_action.connect('activate', () => {
            this.terminal.increase_font_scale();
        });
        terminal_actions.add_action(font_scale_increase_action);

        this.terminal.bind_property(
            'can-increase-font-scale',
            font_scale_increase_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );

        const font_scale_decrease_action = new Gio.SimpleAction({
            name: 'font-scale-decrease',
        });
        font_scale_decrease_action.connect('activate', () => {
            this.terminal.decrease_font_scale();
        });
        terminal_actions.add_action(font_scale_decrease_action);

        this.terminal.bind_property(
            'can-decrease-font-scale',
            font_scale_decrease_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );

        const font_scale_reset_action = new Gio.SimpleAction({
            name: 'font-scale-reset',
            enabled: this.terminal.font_scale !== 1,
        });
        font_scale_reset_action.connect('activate', () => {
            this.terminal.font_scale = 1;
        });
        this.terminal.connect('notify::font-scale', () => {
            font_scale_reset_action.enabled = this.terminal.font_scale !== 1;
        });
        terminal_actions.add_action(font_scale_reset_action);

        const show_in_file_manager_action = new Gio.SimpleAction({
            name: 'show-in-file-manager',
        });
        show_in_file_manager_action.connect('activate', () => {
            this.show_in_file_manager();
        });
        terminal_actions.add_action(show_in_file_manager_action);

        this.insert_action_group('terminal', terminal_actions);

        this.terminal.connect_after('child-exited', (terminal_, status) => {
            if (this.keep_open_after_exit)
                this.set_exit_status_banner(status);
            else
                this.emit('close-request');
        });

        const emit_session_update = () => this.emit('session-update');

        this.connect('notify::banner-visible', emit_session_update);
        this.connect('notify::use-custom-title', emit_session_update);
        this.connect('notify::keep-open-after-exit', emit_session_update);
    }

    get_cwd() {
        return this.terminal.get_cwd();
    }

    set_exit_status_banner(status) {
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

    open_hyperlink() {
        Gtk.show_uri_on_window(
            this.get_ancestor(Gtk.Window),
            this.terminal.last_clicked_hyperlink,
            Gdk.CURRENT_TIME
        );
    }

    copy_hyperlink() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_hyperlink, -1);
    }

    copy_filename() {
        const clipboard = this.terminal.get_clipboard(null);
        clipboard.set_text(this.terminal.last_clicked_filename, -1);
    }

    terminal_button_press_early(_terminal, event) {
        const state = event.get_state()[1];

        if (state & Gdk.ModifierType.CONTROL_MASK) {
            const button = event.get_button()[1];

            if ([Gdk.BUTTON_PRIMARY, Gdk.BUTTON_MIDDLE].includes(button)) {
                this.open_hyperlink();
                return true;
            }
        }

        return false;
    }

    find_next() {
        this.terminal.search_set_regex(this.search_bar.pattern.regex, 0);
        this.terminal.search_find_next();
    }

    find_prev() {
        this.terminal.search_set_regex(this.search_bar.pattern.regex, 0);
        this.terminal.search_find_previous();
    }

    find() {
        this.terminal.get_text_selected_async().then(text => {
            if (text)
                this.search_bar.pattern.text = text;

            this.search_bar.reveal_child = true;
        });
    }

    show_in_file_manager() {
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

    update_title_binding(sync = true) {
        const flags = sync ? GObject.BindingFlags.SYNC_CREATE : GObject.BindingFlags.DEFAULT;
        const source = this.use_custom_title ? this._title_dialog : this.terminal;
        const source_property = this.use_custom_title ? 'custom-title' : 'window-title';

        if ((this._title_binding?.dup_source() ?? null) === (source ?? null))
            return;

        this._title_binding?.unbind();
        this._title_binding = source?.bind_property(source_property, this, 'terminal-title', flags);
    }

    edit_title() {
        if (this._title_dialog) {
            this._title_dialog.present();
            return;
        }

        this._title_dialog = new TabTitleDialog({
            transient_for: this.get_toplevel(),
            custom_title: this.terminal_title,
        });

        this._title_dialog.connect('destroy', () => {
            this._title_dialog = null;
        });

        this.bind_property(
            'use-custom-title',
            this._title_dialog,
            'use-custom-title',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.update_title_binding();
        this._title_dialog.present();
    }

    get title() {
        if (this.switch_shortcut)
            return `${this.switch_shortcut} ${this.terminal_title}`;

        return this.terminal_title;
    }

    vfunc_grab_focus() {
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
});
