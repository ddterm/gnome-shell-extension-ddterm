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
import { TabLabel } from './tablabel.js';
import { Terminal, TerminalCommand } from './terminal.js';
import { TerminalSettings } from './terminalsettings.js';
import { WIFEXITED, WEXITSTATUS, WTERMSIG } from './waitstatus.js';

export const TerminalPage = GObject.registerClass({
    Properties: {
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'terminal-menu': GObject.ParamSpec.object(
            'terminal-menu',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.MenuModel
        ),
        'tab-menu': GObject.ParamSpec.object(
            'tab-menu',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.MenuModel
        ),
        'command': GObject.ParamSpec.object(
            'command',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalCommand
        ),
        'title': GObject.ParamSpec.string(
            'title',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'use-custom-title': GObject.ParamSpec.boolean(
            'use-custom-title',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'keep-open-after-exit': GObject.ParamSpec.boolean(
            'keep-open-after-exit',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'split-layout': GObject.ParamSpec.string(
            'split-layout',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'no-split'
        ),
    },
    Signals: {
        'close': {},
        'new-tab-before-request': {},
        'new-tab-after-request': {},
        'move-prev-request': {},
        'move-next-request': {},
        'split-layout-request': {
            param_types: [String],
        },
        'move-to-other-pane-request': {},
    },
}, class DDTermTerminalPage extends Gtk.Box {
    _init(params) {
        super._init(params);

        this.orientation = Gtk.Orientation.VERTICAL;

        this.terminal = new Terminal({
            visible: true,
            context_menu_model: this.terminal_menu,
            vexpand: true,
        });

        this.terminal_settings.bind_terminal(this.terminal);

        this.scrolled_window = new Gtk.ScrolledWindow({
            child: this.terminal,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this.append(this.scrolled_window);

        this.tab_label = this._setup_tab_label();
        this.search_bar = this._setup_search_bar();
        this.append(this.search_bar);

        this.terminal_settings.bind_property_full(
            'show-scrollbar',
            this.scrolled_window,
            'vscrollbar-policy',
            GObject.BindingFlags.SYNC_CREATE,
            (binding, value) => [true, value ? Gtk.PolicyType.ALWAYS : Gtk.PolicyType.NEVER],
            null
        );

        this._setup_click_controller();

        this.connect('realize', this._setup_page_actions.bind(this));
        this.connect('realize', this._setup_terminal_actions.bind(this));
        this.connect('realize', this._setup_child_handler.bind(this));
    }

    _setup_search_bar() {
        const search_bar = new SearchBar({
            visible: true,
        });

        this.connect('realize', () => {
            const { terminal } = this;

            const handlers = [
                search_bar.connect('find-next', this.find_next.bind(this)),
                search_bar.connect('find-prev', this.find_prev.bind(this)),
                // eslint-disable-next-line no-shadow
                search_bar.connect('notify::wrap', search_bar => {
                    terminal.search_set_wrap_around(search_bar.wrap);
                }),
                // eslint-disable-next-line no-shadow
                search_bar.connect('notify::reveal-child', search_bar => {
                    if (!search_bar.reveal_child)
                        terminal.grab_focus();
                }),
            ];

            this.terminal.search_set_wrap_around(search_bar.wrap);

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);

                for (const handler of handlers)
                    search_bar.disconnect(handler);
            });
        });

        return search_bar;
    }

    _setup_tab_label() {
        const tab_label = new TabLabel({
            context_menu_model: this.tab_menu,
        });

        this.bind_property(
            'title',
            tab_label,
            'label',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.connect('realize', () => {
            const close_handler = tab_label.connect('close', () => this.close());
            const reset_label_handler = tab_label.connect('reset-label', () => {
                this.use_custom_title = false;
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                tab_label.disconnect(close_handler);
                tab_label.disconnect(reset_label_handler);
            });
        });

        return tab_label;
    }

    _setup_click_controller() {
        const early_click = Gtk.GestureClick.new();

        early_click.propagation_phase = Gtk.PropagationPhase.CAPTURE;
        early_click.button = 0;
        early_click.exclusive = true;

        this.terminal.add_controller(early_click);

        this.connect('realize', () => {
            const click_handler =
                early_click.connect('pressed', this.terminal_button_press_early.bind(this));

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                early_click.disconnect(click_handler);
            });
        });
    }

    _setup_page_actions() {
        const page_actions = new Gio.SimpleActionGroup();
        const handlers = [];

        const close_action = new Gio.SimpleAction({ name: 'close' });
        close_action.connect('activate', () => this.close());
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
        handlers.push(this.connect('notify::split-layout', () => {
            split_layout_action.state = GLib.Variant.new_string(this.split_layout);
        }));
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
        handlers.push(this.connect('notify::use-custom-title', () => {
            this.update_title_binding();
        }));
        this.update_title_binding();

        const use_custom_title_action = new Gio.SimpleAction({
            'name': 'use-custom-title',
            'state': GLib.Variant.new_boolean(this.use_custom_title),
            'parameter-type': GLib.VariantType.new('b'),
        });
        use_custom_title_action.connect('change-state', (_, value) => {
            this.use_custom_title = value.get_boolean();
        });
        handlers.push(this.connect('notify::use-custom-title', () => {
            use_custom_title_action.set_state(
                GLib.Variant.new_boolean(this.use_custom_title)
            );
        }));
        use_custom_title_action.connect('activate', (_, param) => {
            use_custom_title_action.change_state(param);

            if (param.get_boolean())
                this.tab_label.edit();
        });
        page_actions.add_action(use_custom_title_action);

        this.insert_action_group('page', page_actions);
        this.tab_label.insert_action_group('page', page_actions);

        handlers.push(this.connect('unrealize', () => {
            for (const handler of handlers)
                this.disconnect(handler);

            this.insert_action_group('page', null);
            this.tab_label.insert_action_group('page', null);
        }));
    }

    _setup_terminal_actions() {
        const terminal_actions = new Gio.SimpleActionGroup();
        const terminal_handlers = [];

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

        terminal_handlers.push(this.terminal.connect('selection-changed', terminal => {
            copy_action.enabled = terminal.get_has_selection();
            copy_html_action.enabled = terminal.get_has_selection();
        }));

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

        terminal_handlers.push(this.terminal.connect('notify::last-clicked-hyperlink', terminal => {
            const enable = terminal.last_clicked_hyperlink !== null;
            open_hyperlink_action.enabled = enable;
            copy_hyperlink_action.enabled = enable;
        }));

        const copy_filename_action = new Gio.SimpleAction({
            name: 'copy-filename',
            enabled: this.terminal.last_clicked_filename !== null,
        });
        copy_filename_action.connect('activate', this.copy_filename.bind(this));
        terminal_actions.add_action(copy_filename_action);

        terminal_handlers.push(this.terminal.connect('notify::last-clicked-filename', terminal => {
            const enable = terminal.last_clicked_filename !== null;
            copy_filename_action.enabled = enable;
        }));

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
        terminal_handlers.push(this.terminal.connect('notify::font-scale', terminal => {
            font_scale_reset_action.enabled = terminal.font_scale !== 1;
        }));
        terminal_actions.add_action(font_scale_reset_action);

        const show_in_file_manager_action = new Gio.SimpleAction({
            name: 'show-in-file-manager',
        });
        show_in_file_manager_action.connect('activate', () => {
            this.show_in_file_manager();
        });
        terminal_actions.add_action(show_in_file_manager_action);

        this.insert_action_group('terminal', terminal_actions);

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of terminal_handlers)
                this.terminal.disconnect(handler);

            this.insert_action_group('terminal', null);
        });
    }

    _setup_child_handler() {
        const child_handler =
            this.terminal.connect_after('child-exited', (terminal_, status) => {
                if (this.keep_open_after_exit)
                    this.add_exit_status_banner(status);
                else
                    this.emit('close');
            });

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.terminal.disconnect(child_handler);
        });
    }

    get_cwd() {
        return this.terminal.get_cwd();
    }

    add_banner(message, message_type = Gtk.MessageType.ERROR) {
        const label = new Gtk.Label({
            label: message,
            visible: true,
        });

        const banner = new Gtk.InfoBar({
            message_type,
            visible: true,
            revealed: true,
        });

        banner.add_child(label);
        banner.add_button(Gettext.gettext('Restart'), 0);
        banner.add_button(Gettext.gettext('Close Terminal'), 1);

        banner.connect('response', (_, response) => {
            switch (response) {
            case 0:
                this.spawn();
                banner.destroy();
                break;
            case 1:
                this.emit('close');
                break;
            }
        });

        this.prepend(banner);
    }

    add_exit_status_banner(status) {
        if (WIFEXITED(status)) {
            const code = WEXITSTATUS(status);

            this.add_banner(
                [
                    Gettext.gettext('The child process exited with status:'),
                    code,
                ].join(' '),
                code === 0 ? Gtk.MessageType.INFO : Gtk.MessageType.WARNING
            );
        } else {
            const signum = WTERMSIG(status);

            this.add_banner(
                [
                    Gettext.gettext('The child process was aborted by signal:'),
                    signum,
                    GLib.strsignal(signum),
                ].join(' '),
                Gtk.MessageType.WARNING
            );
        }
    }

    spawn(callback = null, timeout = -1) {
        if (!this.use_custom_title)
            this.title = this.command.title;

        const callback_wrapper = (...args) => {
            const [terminal_, pid_, error] = args;

            if (error)
                this.add_banner(error.message);

            callback?.(...args);
        };

        this.grab_focus();
        return this.terminal.spawn(this.command, timeout, callback_wrapper);
    }

    open_hyperlink() {
        Gtk.show_uri(
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

    terminal_button_press_early(gesture) {
        if (gesture.get_current_event_state() & Gdk.ModifierType.CONTROL_MASK) {
            if ([Gdk.BUTTON_PRIMARY, Gdk.BUTTON_MIDDLE].includes(gesture.get_current_button())) {
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
        const text = this.terminal.get_text_selected?.(Vte.Format.TEXT);

        if (text)
            this.search_bar.pattern.text = text;

        this.search_bar.reveal_child = true;
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
            this.emit('close');
            return;
        }

        const message = new Gtk.MessageDialog({
            transient_for: this.root,
            modal: true,
            buttons: Gtk.ButtonsType.CANCEL,
            message_type: Gtk.MessageType.WARNING,
            text: Gettext.gettext('Close this terminal?'),
            secondary_text: Gettext.gettext(
                'There is still a process running in this terminal.' +
                ' Closing the terminal will kill it.'
            ),
        });

        const remove_button = message.add_button(
            Gettext.gettext('Close Terminal'),
            Gtk.ResponseType.ACCEPT
        );

        remove_button.get_style_context().add_class('destructive-action');

        message.connect('response', (_, response_id) => {
            if (response_id === Gtk.ResponseType.ACCEPT)
                this.emit('close');

            message.destroy();
        });

        message.set_default_response(Gtk.ResponseType.ACCEPT);
        message.show();
    }

    update_title_binding() {
        const enable = !this.use_custom_title;

        if (enable === Boolean(this._title_binding))
            return;

        if (enable) {
            this._title_binding = this.terminal.bind_property(
                'window-title',
                this,
                'title',
                GObject.BindingFlags.SYNC_CREATE
            );
        } else {
            this._title_binding?.unbind();
            this._title_binding = null;
        }
    }

    vfunc_grab_focus() {
        this.terminal.grab_focus();
    }

    serialize_state() {
        const properties = GLib.VariantDict.new(null);
        const cwd = this.get_cwd();
        const command = cwd ? this.command.override_working_directory(cwd) : this.command;

        properties.insert_value('command', command.to_gvariant());
        properties.insert_value('title', GLib.Variant.new_string(this.title));
        properties.insert_value(
            'use-custom-title',
            GLib.Variant.new_boolean(this.use_custom_title)
        );
        properties.insert_value(
            'keep-open-after-exit',
            GLib.Variant.new_boolean(this.keep_open_after_exit)
        );

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
            title: dict.lookup('title', 's'),
            use_custom_title: dict.lookup('use-custom-title', 'b'),
            keep_open_after_exit: dict.lookup('keep-open-after-exit', 'b'),
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
