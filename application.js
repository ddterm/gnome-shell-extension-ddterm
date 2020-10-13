'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.GObject = '2.0';
imports.gi.versions.Gio = '2.0';
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Pango = '1.0';
imports.gi.versions.Vte = '2.91';

const System = imports.system;
const { GLib, GObject, Gio, Gdk, Gtk, Pango, Vte } = imports.gi;

const SELECTION_CLIPBOARD = Gdk.Atom.intern('CLIPBOARD', true);

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const { util } = imports;

function remove_prefix(s, prefix) {
    if (s.startsWith(prefix))
        return s.substring(prefix.length);

    return s;
}

function simple_action(group, name) {
    const action = new Gio.SimpleAction({
        name,
    });

    group.add_action(action);
    return action;
}

function terminal_spawn_callback(terminal, _pid, error) {
    if (error)
        terminal.feed(error.message);
}

GObject.type_ensure(Vte.Terminal);

const TerminalPage = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('terminalpage.ui').get_uri(),
        Children: ['terminal', 'tab_label', 'tab_label_label', 'scrollbar', 'close_button', 'switch_shortcut_label', 'switcher_item'],
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'menus': GObject.ParamSpec.object(
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
            'has-selection': GObject.ParamSpec.boolean(
                'has-selection', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'has-clicked-hyperlink': GObject.ParamSpec.boolean(
                'has-clicked-hyperlink', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'has-clicked-filename': GObject.ParamSpec.boolean(
                'has-clicked-filename', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'switch-shortcut': GObject.ParamSpec.string(
                'switch-shortcut', '', '', GObject.ParamFlags.WRITABLE, null
            ),
        },
        Signals: {
            'close-request': {},
        },
    },
    class TerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.clicked_filename = null;
            this.clicked_hyperlink = null;

            this.bind_settings_ro('show-scrollbar', this.scrollbar, 'visible');
            this.bind_settings_ro('scroll-on-output', this.terminal);
            this.bind_settings_ro('scroll-on-keystroke', this.terminal);
            this.bind_settings_ro('text-blink-mode', this.terminal);
            this.bind_settings_ro('cursor-blink-mode', this.terminal);
            this.bind_settings_ro('cursor-shape', this.terminal);
            this.bind_settings_ro('allow-hyperlink', this.terminal);
            this.bind_settings_ro('audible-bell', this.terminal);
            this.bind_settings_ro('bold-is-bright', this.terminal);
            this.bind_settings_ro('tab-close-buttons', this.close_button, 'visible');
            this.bind_settings_ro('show-tab-switch-hotkeys', this.switch_shortcut_label, 'visible');

            this.method_handler(this.settings, 'changed::scrollback-lines', this.update_scrollback);
            this.method_handler(this.settings, 'changed::scrollback-unlimited', this.update_scrollback);
            this.update_scrollback();

            this.method_handler(this.settings, 'changed::custom-font', this.update_font);
            this.method_handler(this.settings, 'changed::use-system-font', this.update_font);
            this.method_handler(this.desktop_settings, 'changed::monospace-font-name', this.update_font);
            this.update_font();

            this.method_handler(this.settings, 'changed::foreground-color', this.update_color_foreground);
            this.method_handler(this.terminal, 'style-updated', this.update_color_foreground);

            this.method_handler(this.settings, 'changed::background-color', this.update_color_background);
            this.method_handler(this.settings, 'changed::background-opacity', this.update_color_background);
            this.method_handler(this.terminal, 'style-updated', this.update_color_background);

            this.method_handler(this.settings, 'changed::bold-color', this.update_color_bold);
            this.method_handler(this.settings, 'changed::bold-color-same-as-fg', this.update_color_bold);

            this.method_handler(this.settings, 'changed::cursor-background-color', this.update_color_cursor);
            this.method_handler(this.settings, 'changed::cursor-colors-set', this.update_color_cursor);

            this.method_handler(this.settings, 'changed::cursor-foreground-color', this.update_color_cursor_foreground);
            this.method_handler(this.settings, 'changed::cursor-colors-set', this.update_color_cursor_foreground);

            this.method_handler(this.settings, 'changed::highlight-background-color', this.update_color_highlight);
            this.method_handler(this.settings, 'changed::highlight-colors-set', this.update_color_highlight);

            this.method_handler(this.settings, 'changed::highlight-foreground-color', this.update_color_highlight_foreground);
            this.method_handler(this.settings, 'changed::highlight-colors-set', this.update_color_highlight_foreground);

            this.method_handler(this.settings, 'changed::palette', this.update_palette);

            this.method_handler(this.settings, 'changed::use-theme-colors', this.update_all_colors);
            this.update_all_colors();

            this.method_handler(this.terminal, 'child-exited', this.close_request);
            this.signal_connect(this.terminal, 'selection-changed', () => {
                this.notify('has-selection');
            });

            this.terminal.bind_property('window-title', this.tab_label_label, 'label', GObject.BindingFlags.DEFAULT);
            this.terminal.bind_property('window-title', this.switcher_item, 'text', GObject.BindingFlags.DEFAULT);

            this.terminal_popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('terminal-popup'));
            this.setup_popup_menu(this.terminal, this.terminal_popup_menu);
            this.method_handler(this.terminal, 'button-press-event', this.terminal_button_press_early);

            const tab_popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('tab-popup'));
            this.setup_popup_menu(this.tab_label, tab_popup_menu);

            const actions = new Gio.SimpleActionGroup();
            this.insert_action_group('page', actions);
            this.tab_label.insert_action_group('page', actions);

            this.method_action(actions, 'close', this.close_request);

            const terminal_actions = new Gio.SimpleActionGroup();
            this.insert_action_group('terminal', terminal_actions);

            const copy_action = this.method_action(terminal_actions, 'copy', this.copy);
            this.bind_property('has-selection', copy_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_html_action = this.method_action(terminal_actions, 'copy-html', this.copy_html);
            this.bind_property('has-selection', copy_html_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const open_hyperlink_action = this.method_action(terminal_actions, 'open-hyperlink', this.open_hyperlink);
            this.bind_property('has-clicked-hyperlink', open_hyperlink_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_hyperlink_action = this.method_action(terminal_actions, 'copy-hyperlink', this.copy_hyperlink);
            this.bind_property('has-clicked-hyperlink', copy_hyperlink_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_filename_action = this.method_action(terminal_actions, 'copy-filename', this.copy_filename);
            this.bind_property('has-clicked-filename', copy_filename_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            this.method_action(terminal_actions, 'paste', this.paste);
            this.method_action(terminal_actions, 'select-all', this.select_all);
            this.method_action(terminal_actions, 'reset', this.reset);
            this.method_action(terminal_actions, 'reset-and-clear', this.reset_and_clear);
        }

        get has_clicked_filename() {
            return this.clicked_filename !== null;
        }

        get has_clicked_hyperlink() {
            return this.clicked_hyperlink !== null;
        }

        spawn() {
            let argv;
            let spawn_flags;

            const mode = this.settings.get_string('command');
            if (mode === 'custom-command') {
                const command = this.settings.get_string('custom-command');

                let _;
                [_, argv] = GLib.shell_parse_argv(command);

                spawn_flags = GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else if (mode === 'user-shell' || mode === 'user-shell-login') {
                const shell = Vte.get_user_shell();
                const name = GLib.path_get_basename(shell);

                if (mode === 'user-shell-login')
                    argv = [shell, `-${name}`];
                else
                    argv = [shell, name];

                spawn_flags = GLib.SpawnFlags.FILE_AND_ARGV_ZERO;

                if (name !== shell)
                    spawn_flags |= GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else {
                this.terminal.feed(`Invalid command: ${mode}`);
                return;
            }

            this.terminal.spawn_async(
                Vte.PtyFlags.DEFAULT, null, argv, null, spawn_flags, null, -1, null, terminal_spawn_callback
            );
        }

        close_request() {
            this.emit('close-request');
        }

        get_font_settings() {
            if (this.settings.get_boolean('use-system-font'))
                return this.desktop_settings.get_string('monospace-font-name');
            else
                return this.settings.get_string('custom-font');
        }

        update_font() {
            this.terminal.font_desc = Pango.FontDescription.from_string(this.get_font_settings());
        }

        get_style_color_settings(key, style_property) {
            if (!this.settings.get_boolean('use-theme-colors')) {
                const result = util.parse_rgba(this.settings.get_string(key));
                if (result !== null)
                    return result;
            }

            const context = this.terminal.get_style_context();
            return context.get_property(style_property, context.get_state());
        }

        get_override_color_settings(key, enable_key, enable_reverse = false) {
            if (this.settings.get_boolean('use-theme-colors'))
                return null;

            if (this.settings.get_boolean(enable_key) === enable_reverse)
                return null;

            return util.parse_rgba(this.settings.get_string(key));
        }

        get_color_foreground() {
            return this.get_style_color_settings('foreground-color', 'color');
        }

        get_color_background() {
            const background = this.get_style_color_settings('background-color', 'background-color');
            background.alpha = this.settings.get_double('background-opacity');
            return background;
        }

        update_color_foreground() {
            this.terminal.set_color_foreground(this.get_color_foreground());
        }

        update_color_background() {
            this.terminal.set_color_background(this.get_color_background());
        }

        update_palette() {
            this.terminal.set_colors(
                this.get_color_foreground(),
                this.get_color_background(),
                this.settings.get_strv('palette').map(util.parse_rgba)
            );
        }

        update_color_bold() {
            this.terminal.set_color_bold(
                this.get_override_color_settings('bold-color', 'bold-color-same-as-fg', true)
            );
        }

        update_color_cursor() {
            this.terminal.set_color_cursor(
                this.get_override_color_settings('cursor-background-color', 'cursor-colors-set')
            );
        }

        update_color_cursor_foreground() {
            this.terminal.set_color_cursor_foreground(
                this.get_override_color_settings('cursor-foreground-color', 'cursor-colors-set')
            );
        }

        update_color_highlight() {
            this.terminal.set_color_highlight(
                this.get_override_color_settings('highlight-background-color', 'highlight-colors-set')
            );
        }

        update_color_highlight_foreground() {
            this.terminal.set_color_highlight_foreground(
                this.get_override_color_settings('highlight-foreground-color', 'highlight-colors-set')
            );
        }

        update_all_colors() {
            this.update_palette();
            this.update_color_bold();
            this.update_color_cursor();
            this.update_color_cursor_foreground();
            this.update_color_highlight();
            this.update_color_highlight_foreground();
        }

        update_scrollback() {
            if (this.settings.get_boolean('scrollback-unlimited'))
                this.terminal.scrollback_lines = -1;
            else
                this.terminal.scrollback_lines = this.settings.get_int('scrollback-lines');
        }

        get has_selection() {
            return this.terminal.get_has_selection();
        }

        copy() {
            this.terminal.copy_clipboard_format(Vte.Format.TEXT);
        }

        copy_html() {
            this.terminal.copy_clipboard_format(Vte.Format.HTML);
        }

        paste() {
            this.terminal.paste_clipboard();
        }

        select_all() {
            this.terminal.select_all();
        }

        reset() {
            this.terminal.reset(true, false);
        }

        reset_and_clear() {
            this.terminal.reset(true, true);
        }

        terminal_button_press_early(_terminal, event) {
            const state = event.get_state()[1];
            const button = event.get_button()[1];

            this.clicked_hyperlink = this.terminal.hyperlink_check_event(event);
            if (this.clicked_hyperlink) {
                try {
                    this.clicked_filename = GLib.filename_from_uri(this.clicked_hyperlink)[0];
                } catch {
                    this.clicked_filename = null;
                }
            } else {
                this.clicked_filename = null;
            }

            this.notify('has-clicked-filename');
            this.notify('has-clicked-hyperlink');

            if (state & Gdk.ModifierType.CONTROL_MASK) {
                if ([Gdk.BUTTON_PRIMARY, Gdk.BUTTON_MIDDLE].includes(button)) {
                    this.open_hyperlink();
                    return true;
                }
            }

            if (event.triggers_context_menu()) {
                if (state & Gdk.ModifierType.SHIFT_MASK) {
                    if (!(state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.MOD1_MASK))) {
                        this.terminal_popup_menu.popup_at_pointer(event);
                        return true;
                    }
                }
            }

            return false;
        }

        open_hyperlink() {
            Gtk.show_uri_on_window(this.get_ancestor(Gtk.Window), this.clicked_hyperlink, Gdk.CURRENT_TIME);
        }

        copy_hyperlink() {
            this.get_clipboard(SELECTION_CLIPBOARD).set_text(this.clicked_hyperlink, -1);
        }

        copy_filename() {
            this.get_clipboard(SELECTION_CLIPBOARD).set_text(this.clicked_filename, -1);
        }

        set switch_shortcut(value) {
            if (value) {
                const [key, mods] = Gtk.accelerator_parse(value);
                if (key) {
                    this.switch_shortcut_label.label = Gtk.accelerator_get_label(key, mods);
                    return;
                }
            }

            this.switch_shortcut_label.label = '';
        }

        method_action(group, name, method) {
            const action = simple_action(group, name);
            this.signal_connect(action, 'activate', method.bind(this));
            return action;
        }

        setup_popup_menu(widget, menu, widget_anchor = Gdk.Gravity.SOUTH, menu_anchor = Gdk.Gravity.SOUTH) {
            menu.attach_widget = widget;

            const press_event_id = widget.connect_after('button-press-event', (_, event) => {
                if (!event.triggers_context_menu())
                    return false;

                menu.popup_at_pointer(event);
                return true;
            });
            this.disconnect_on_destroy(widget, press_event_id);

            const popup_menu_id = widget.connect('popup-menu', () => {
                menu.popup_at_widget(widget, widget_anchor, menu_anchor, null);
                return true;
            });
            this.disconnect_on_destroy(widget, popup_menu_id);
        }
    }
);

Object.assign(TerminalPage.prototype, util.UtilMixin);

const AppWindow = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('appwindow.ui').get_uri(),
        Children: ['notebook', 'resize_box', 'tab_switch_button', 'new_tab_button', 'tab_switch_menu_box'],
        Properties: {
            'menus': GObject.ParamSpec.object(
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
            'settings': GObject.ParamSpec.object(
                'settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init(params);

            this.method_handler(this, 'realize', this.set_wm_functions);
            this.method_handler(this, 'screen-changed', this.setup_rgba_visual);
            this.method_handler(this, 'draw', this.draw);

            this.app_paintable = true;
            this.setup_rgba_visual();

            this.method_handler(this.notebook, 'page-removed', this.close_if_no_pages);

            this.toggle_action = simple_action(this, 'toggle');
            this.method_handler(this.toggle_action, 'activate', this.toggle);

            this.hide_action = simple_action(this, 'hide');
            this.signal_connect(this.hide_action, 'activate', () => this.hide());

            this.method_handler(simple_action(this, 'new-tab'), 'activate', this.new_tab);

            this.method_handler(this.resize_box, 'realize', this.set_resize_cursor);
            this.method_handler(this.resize_box, 'button-press-event', this.start_resizing);

            this.tab_select_action = new Gio.PropertyAction({
                name: 'switch-to-tab',
                object: this.notebook,
                property_name: 'page',
            });
            this.add_action(this.tab_select_action);

            this.signal_connect(simple_action(this, 'next-tab'), 'activate', () => this.notebook.next_page());
            this.signal_connect(simple_action(this, 'prev-tab'), 'activate', () => this.notebook.prev_page());

            this.bind_settings_ro('window-skip-taskbar', this, 'skip-taskbar-hint');
            this.bind_settings_ro('window-skip-pager', this, 'skip-pager-hint');

            this.bind_settings_ro('new-tab-button', this.new_tab_button, 'visible');
            this.bind_settings_ro('tab-switcher-popup', this.tab_switch_button, 'visible');

            this.method_handler(this.settings, 'changed::tab-policy', this.update_tab_bar_visibility);
            this.method_handler(this.notebook, 'page-added', this.update_tab_bar_visibility);
            this.method_handler(this.notebook, 'page-removed', this.update_tab_bar_visibility);

            this.method_handler(this.notebook, 'page-added', this.update_tab_shortcut_labels);
            this.method_handler(this.notebook, 'page-removed', this.update_tab_shortcut_labels);
            this.method_handler(this.notebook, 'page-reordered', this.update_tab_shortcut_labels);
            this.method_handler(this, 'keys-changed', this.update_tab_shortcut_labels);

            this.method_handler(this.settings, 'changed::tab-expand', this.update_tab_expand);

            this.method_handler(this.notebook, 'page-added', this.tab_switcher_add);
            this.method_handler(this.notebook, 'page-removed', this.tab_switcher_remove);
            this.method_handler(this.notebook, 'page-reordered', this.tab_switcher_reorder);

            this.new_tab();
        }

        set_wm_functions() {
            this.window.set_functions(Gdk.WMFunction.MOVE | Gdk.WMFunction.RESIZE | Gdk.WMFunction.CLOSE);
        }

        update_tab_bar_visibility() {
            const policy = this.settings.get_string('tab-policy');
            if (policy === 'always')
                this.notebook.show_tabs = true;
            else if (policy === 'never')
                this.notebook.show_tabs = false;
            else if (policy === 'automatic')
                this.notebook.show_tabs = this.notebook.get_n_pages() > 1;
        }

        update_tab_expand() {
            for (let i = 0; i < this.notebook.get_n_pages(); i++)
                this.notebook.child_set_property(this.notebook.get_nth_page(i), 'tab-expand', this.settings.get_boolean('tab-expand'));
        }

        update_tab_shortcut_labels(_source, _child = null, start_page = 0) {
            for (let i = start_page; i < this.notebook.get_n_pages(); i++) {
                const shortcuts = app.get_accels_for_action(`win.switch-to-tab(${i})`);
                const shortcut = shortcuts && shortcuts.length > 0 ? shortcuts[0] : null;
                this.notebook.get_nth_page(i).switch_shortcut = shortcut;
            }
        }

        toggle() {
            if (this.visible)
                this.hide();
            else
                this.show();
        }

        new_tab() {
            const page = new TerminalPage({
                settings: this.settings,
                menus: this.menus,
                desktop_settings: this.desktop_settings,
            });

            const index = this.notebook.append_page(page, page.tab_label);
            this.notebook.set_current_page(index);
            this.notebook.set_tab_reorderable(page, true);
            this.notebook.child_set_property(page, 'tab-expand', this.settings.get_boolean('tab-expand'));

            this.method_handler(page, 'close-request', this.remove_page);
            page.spawn();
        }

        setup_rgba_visual() {
            const visual = this.screen.get_rgba_visual();
            if (visual)
                this.set_visual(visual);
        }

        remove_page(page) {
            this.notebook.remove(page);
            page.destroy();
        }

        close_if_no_pages() {
            if (this.notebook.get_n_pages() === 0)
                this.close();
        }

        set_resize_cursor(widget) {
            widget.window.cursor = Gdk.Cursor.new_from_name(widget.get_display(), 'ns-resize');
        }

        start_resizing(_, event) {
            const [button_ok, button] = event.get_button();
            if (!button_ok || button !== Gdk.BUTTON_PRIMARY)
                return;

            const [coords_ok, x_root, y_root] = event.get_root_coords();
            if (!coords_ok)
                return;

            this.begin_resize_drag(Gdk.WindowEdge.SOUTH, button, x_root, y_root, event.get_time());
        }

        draw(_widget, cr) {
            const context = this.get_style_context();
            const allocation = this.get_child().get_allocation();
            Gtk.render_background(context, cr, allocation.x, allocation.y, allocation.width, allocation.height);
            Gtk.render_frame(context, cr, allocation.x, allocation.y, allocation.width, allocation.height);

            return false;
        }

        tab_switcher_add(_notebook, child, page_num) {
            child.switcher_item.action_target = GLib.Variant.new_int32(page_num);
            this.tab_switch_menu_box.add(child.switcher_item);
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions(page_num + 1);
        }

        tab_switcher_remove(_notebook, child, page_num) {
            this.tab_switch_menu_box.remove(child.switcher_item);
            this.tab_switcher_update_actions(page_num);
        }

        tab_switcher_reorder(_notebook, child, page_num) {
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions(page_num);
        }

        tab_switcher_update_actions(start_page_num) {
            const items = this.tab_switch_menu_box.get_children();
            for (let i = start_page_num; i < items.length; i++)
                items[i].action_target = GLib.Variant.new_int32(i);
        }
    }
);

Object.assign(AppWindow.prototype, util.UtilMixin);

const PrefsWidget = imports.prefs.createPrefsWidgetClass(APP_DATA_DIR, util);

const PrefsDialog = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('prefsdialog.ui').get_uri(),
        Properties: {
            settings: GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
        },
    },
    class PrefsDialog extends Gtk.Dialog {
        _init(params) {
            super._init(params);

            this.get_content_area().add(new PrefsWidget({
                settings: this.settings,
            }));
        }
    }
);

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.decorated = true;

            this.add_main_option(
                'undecorated', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE, 'Hide window decorations', null
            );

            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
            this.connect('handle-local-options', this.handle_local_options.bind(this));

            this.window = null;
            this.prefs_dialog = null;
        }

        startup() {
            simple_action(this, 'quit').connect('activate', this.quit.bind(this));

            const settings_source = Gio.SettingsSchemaSource.new_from_directory(
                APP_DATA_DIR.get_child('schemas').get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );

            this.settings = new Gio.Settings({
                settings_schema: settings_source.lookup('com.github.amezin.ddterm', true),
            });

            const desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });

            const menus = Gtk.Builder.new_from_file(APP_DATA_DIR.get_child('menus.ui').get_path());

            this.window = new AppWindow({
                application: this,
                decorated: this.decorated,
                settings: this.settings,
                desktop_settings,
                menus,
            });

            this.add_action(this.window.toggle_action);
            this.add_action(this.window.hide_action);

            simple_action(this, 'preferences').connect('activate', this.preferences.bind(this));

            this.gtk_settings = Gtk.Settings.get_default();
            this.settings.connect('changed::theme-variant', this.update_theme.bind(this));
            this.update_theme();

            this.setup_shortcut('shortcut-window-hide', 'win.hide');
            this.setup_shortcut('shortcut-terminal-copy', 'terminal.copy');
            this.setup_shortcut('shortcut-terminal-copy-html', 'terminal.copy-html');
            this.setup_shortcut('shortcut-terminal-paste', 'terminal.paste');
            this.setup_shortcut('shortcut-terminal-select-all', 'terminal.select-all');
            this.setup_shortcut('shortcut-terminal-reset', 'terminal.reset');
            this.setup_shortcut('shortcut-terminal-reset-and-clear', 'terminal.reset-and-clear');
            this.setup_shortcut('shortcut-win-new-tab', 'win.new-tab');
            this.setup_shortcut('shortcut-page-close', 'page.close');
            this.setup_shortcut('shortcut-prev-tab', 'win.prev-tab');
            this.setup_shortcut('shortcut-next-tab', 'win.next-tab');

            for (let i = 0; i < 10; i += 1)
                this.setup_shortcut(`shortcut-switch-to-tab-${i + 1}`, `win.switch-to-tab(${i})`);
        }

        activate() {
            this.window.show();
        }

        handle_local_options(_, options) {
            if (options.contains('undecorated'))
                this.decorated = false;

            return -1;
        }

        preferences() {
            if (this.prefs_dialog === null) {
                this.prefs_dialog = new PrefsDialog({
                    transient_for: this.window,
                    settings: this.settings,
                });

                this.prefs_dialog.connect('delete-event', () => this.prefs_dialog.hide_on_delete());
            }

            this.prefs_dialog.show();
        }

        quit() {
            super.quit();
        }

        update_shortcut(key, action) {
            const accels = this.settings.get_boolean('shortcuts-enabled') ? this.settings.get_strv(key) : [];

            if (action === 'win.hide' && this.settings.get_boolean('hide-window-on-esc'))
                accels.push('Escape');

            this.set_accels_for_action(action, accels);
        }

        setup_shortcut(key, action) {
            const update_fn = this.update_shortcut.bind(this, key, action);
            this.settings.connect(`changed::${key}`, update_fn);
            this.settings.connect('changed::shortcuts-enabled', update_fn);
            update_fn();
        }

        update_theme() {
            const theme = this.settings.get_string('theme-variant');
            if (theme === 'system')
                this.gtk_settings.reset_property('gtk-application-prefer-dark-theme');
            else if (theme === 'dark')
                this.gtk_settings.gtk_application_prefer_dark_theme = true;
            else if (theme === 'light')
                this.gtk_settings.gtk_application_prefer_dark_theme = false;
        }
    }
);

// App directory is prepended to PATH by the extension
GLib.setenv('PATH', remove_prefix(remove_prefix(GLib.getenv('PATH'), APP_DATA_DIR.get_path()), ':'), true);

GLib.set_application_name('Drop Down Terminal');
Gdk.set_allowed_backends('x11');

const app = new Application({
    application_id: 'com.github.amezin.ddterm',
    flags: Gio.ApplicationFlags.ALLOW_REPLACEMENT,
});
app.run([System.programInvocationName].concat(ARGV));
