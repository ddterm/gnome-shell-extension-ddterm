// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Jing Yen Loh
// SPDX-FileContributor: Mike Lei
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Vte from 'gi://Vte';

import { regex_for_match } from './regex.js';
import { tcgetpgrp, InterpreterNotFoundError } from './tcgetpgrp.js';

import {
    REGEX_URL_AS_IS,
    REGEX_URL_FILE,
    REGEX_URL_HTTP,
    REGEX_URL_VOIP,
    REGEX_EMAIL,
    REGEX_NEWS_MAN,
} from './urldetect_patterns.js';

export function WEXITSTATUS(status) {
    return (status & 0xff00) >> 8;
}

export function WTERMSIG(status) {
    return status & 0x7f;
}

export function WIFEXITED(status) {
    return WTERMSIG(status) === 0;
}

export const URL_REGEX = {
    'detect-urls-as-is': {
        regex: regex_for_match(REGEX_URL_AS_IS),
    },
    'detect-urls-file': {
        regex: regex_for_match(REGEX_URL_FILE),
    },
    'detect-urls-http': {
        regex: regex_for_match(REGEX_URL_HTTP),
        prefix: 'http://',
    },
    'detect-urls-voip': {
        regex: regex_for_match(REGEX_URL_VOIP),
    },
    'detect-urls-email': {
        regex: regex_for_match(REGEX_EMAIL),
        prefix: 'mailto:',
    },
    'detect-urls-news-man': {
        regex: regex_for_match(REGEX_NEWS_MAN),
    },
};

const PANGO_SCALE_XX_SMALL = 0.5787037037037;
const PANGO_SCALE_X_SMALL = 0.6944444444444;
const PANGO_SCALE_SMALL = 0.8333333333333;
const PANGO_SCALE_MEDIUM = 1.0;
const PANGO_SCALE_LARGE = 1.2;
const PANGO_SCALE_X_LARGE = 1.44;
const PANGO_SCALE_XX_LARGE = 1.728;

const TERMINAL_SCALE_XXX_SMALL = PANGO_SCALE_XX_SMALL / 1.2;
const TERMINAL_SCALE_XXXX_SMALL = TERMINAL_SCALE_XXX_SMALL / 1.2;
const TERMINAL_SCALE_XXXXX_SMALL = TERMINAL_SCALE_XXXX_SMALL / 1.2;
const TERMINAL_SCALE_XXX_LARGE = PANGO_SCALE_XX_LARGE * 1.2;
const TERMINAL_SCALE_XXXX_LARGE = TERMINAL_SCALE_XXX_LARGE * 1.2;
const TERMINAL_SCALE_XXXXX_LARGE = TERMINAL_SCALE_XXXX_LARGE * 1.2;
const TERMINAL_SCALE_MINIMUM = TERMINAL_SCALE_XXXXX_SMALL / 1.2;
const TERMINAL_SCALE_MAXIMUM = TERMINAL_SCALE_XXXXX_LARGE * 1.2;

const ZOOM_FACTORS = [
    TERMINAL_SCALE_MINIMUM,
    TERMINAL_SCALE_XXXXX_SMALL,
    TERMINAL_SCALE_XXXX_SMALL,
    TERMINAL_SCALE_XXX_SMALL,
    PANGO_SCALE_XX_SMALL,
    PANGO_SCALE_X_SMALL,
    PANGO_SCALE_SMALL,
    PANGO_SCALE_MEDIUM,
    PANGO_SCALE_LARGE,
    PANGO_SCALE_X_LARGE,
    PANGO_SCALE_XX_LARGE,
    TERMINAL_SCALE_XXX_LARGE,
    TERMINAL_SCALE_XXXX_LARGE,
    TERMINAL_SCALE_XXXXX_LARGE,
    TERMINAL_SCALE_MAXIMUM,
];

const ZOOM_FACTORS_REVERSE = ZOOM_FACTORS.slice().reverse();

function find_larger_zoom_factor(current) {
    for (const factor of ZOOM_FACTORS) {
        if (factor - current > 1e-6)
            return factor;
    }

    return null;
}

function find_smaller_zoom_factor(current) {
    for (const factor of ZOOM_FACTORS_REVERSE) {
        if (current - factor > 1e-6)
            return factor;
    }

    return null;
}

export const PALETTE_SIZE = 16;

const PALETTE_PROPERTIES = Array.from(
    { length: PALETTE_SIZE },
    (_, index) => `palette${index}`
);

function color_pspec(name, flags) {
    return GObject.ParamSpec.boxed(
        name,
        null,
        null,
        flags,
        Gdk.RGBA
    );
}

export class TerminalColors extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermTerminalColors';

    static [GObject.properties] = Object.fromEntries(
        [
            'foreground',
            'background',
            ...PALETTE_PROPERTIES,
        ].map(name => [
            name,
            color_pspec(
                name,
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
            ),
        ])
    );

    static {
        GObject.registerClass(this);
    }

    get palette() {
        return PALETTE_PROPERTIES.map(prop => this[prop]);
    }

    static new(foreground, background, palette) {
        return new TerminalColors({
            foreground,
            background,
            ...Object.fromEntries(
                palette.map((value, index) => [PALETTE_PROPERTIES[index], value])
            ),
        });
    }
}

export class TerminalCommand extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermTerminalCommand';

    static [GObject.properties] = {
        'argv': GObject.ParamSpec.boxed(
            'argv',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'envv': GObject.ParamSpec.boxed(
            'envv',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'working-directory': GObject.ParamSpec.object(
            'working-directory',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.File
        ),
        'search-path': GObject.ParamSpec.boolean(
            'search-path',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            true
        ),
        'file-and-argv-zero': GObject.ParamSpec.boolean(
            'file-and-argv-zero',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            false
        ),
    };

    static {
        GObject.registerClass(this);
    }

    get spawn_flags() {
        let result = GLib.SpawnFlags.DEFAULT;

        if (this.search_path)
            result |= GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;

        if (this.file_and_argv_zero)
            result |= GLib.SpawnFlags.FILE_AND_ARGV_ZERO;

        return result;
    }

    get title() {
        return this.argv[this.file_and_argv_zero ? 1 : 0];
    }

    static shell(working_directory = null, envv = null, login = false) {
        const shell = Vte.get_user_shell();
        const name = GLib.path_get_basename(shell);
        const argv = [shell, login ? `-${name}` : name];

        return new TerminalCommand({
            argv,
            envv,
            working_directory,
            search_path: name === shell,
            file_and_argv_zero: true,
        });
    }

    static login_shell(working_directory = null, envv = null) {
        return TerminalCommand.shell(working_directory, envv, true);
    }

    static parse(command, working_directory = null, envv = null) {
        const [, argv] = GLib.shell_parse_argv(command);

        return new TerminalCommand({
            argv,
            envv,
            working_directory,
        });
    }

    override_working_directory(new_cwd) {
        return new TerminalCommand({
            argv: this.argv,
            envv: this.envv,
            working_directory: new_cwd,
            search_path: this.search_path,
            file_and_argv_zero: this.file_and_argv_zero,
        });
    }

    to_gvariant() {
        const dict = GLib.VariantDict.new(null);

        dict.insert_value('argv', new GLib.Variant('as', this.argv));

        if (this.envv)
            dict.insert_value('envv', new GLib.Variant('as', this.envv));

        if (this.working_directory) {
            const path = this.working_directory.get_path();

            if (path)
                dict.insert_value('working-directory', GLib.Variant.new_string(path));
        }

        dict.insert_value('search-path', GLib.Variant.new_boolean(this.search_path));
        dict.insert_value('file-and-argv-zero', GLib.Variant.new_boolean(this.file_and_argv_zero));

        return dict.end();
    }

    static from_gvariant(variant) {
        const dict = GLib.VariantDict.new(variant);
        const working_directory =  dict.lookup('working-directory', 's');

        return new TerminalCommand({
            argv: dict.lookup('argv', 'as', true),
            envv: dict.lookup('envv', 'as', true),
            working_directory: working_directory ? Gio.File.new_for_path(working_directory) : null,
            search_path: dict.lookup('search-path', 'b'),
            file_and_argv_zero: dict.lookup('file-and-argv-zero', 'b'),
        });
    }
}

class TerminalBase extends Vte.Terminal {
    static [GObject.GTypeName] = 'DDTermTerminalBase';

    static [GObject.properties] = {
        'colors': GObject.ParamSpec.object(
            'colors',
            null,
            null,
            GObject.ParamFlags.WRITABLE,
            TerminalColors
        ),
        ...Object.fromEntries(
            [
                'color-foreground',
                'color-background',
                'color-bold',
                'color-cursor',
                'color-cursor-foreground',
                'color-highlight',
                'color-highlight-foreground',
            ].map(name => [name, color_pspec(name, GObject.ParamFlags.WRITABLE)])
        ),
        // has effect only when background color from style is used
        'background-opacity': GObject.ParamSpec.double(
            'background-opacity',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            1,
            1
        ),
        'url-detect-patterns': GObject.ParamSpec.boxed(
            'url-detect-patterns',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'child-pid': GObject.ParamSpec.int(
            'child-pid',
            null,
            null,
            GObject.ParamFlags.READABLE,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'last-clicked-hyperlink': GObject.ParamSpec.string(
            'last-clicked-hyperlink',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'last-clicked-filename': GObject.ParamSpec.string(
            'last-clicked-filename',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'can-increase-font-scale': GObject.ParamSpec.boolean(
            'can-increase-font-scale',
            null,
            null,
            GObject.ParamFlags.READABLE,
            true
        ),
        'can-decrease-font-scale': GObject.ParamSpec.boolean(
            'can-decrease-font-scale',
            null,
            null,
            GObject.ParamFlags.READABLE,
            true
        ),
        'has-selection': GObject.ParamSpec.boolean(
            'has-selection',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'copy-on-selection': GObject.ParamSpec.boolean(
            'copy-on-selection',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static [GObject.signals] = {
        'open-hyperlink': {
            param_types: [String],
        },
    };

    static {
        GObject.registerClass(this);
    }

    #child_pid = 0;
    #has_selection = false;
    #clicked_filename = null;
    #clicked_hyperlink = null;
    #url_prefix;
    #foreground_from_style = false;
    #background_from_style = false;
    #gesture_single = null;

    constructor(params) {
        super(params);

        this.connect('child-exited', () => {
            this.#child_pid = 0;
            this.notify('child-pid');
        });

        this.connect('notify::background-opacity', () => {
            if (this.#background_from_style)
                this.set_color_background(null);
        });

        if (this.#background_from_style)
            this.set_color_background(null);

        this.connect('notify::font-scale', () => {
            this.notify('can-increase-font-scale');
            this.notify('can-decrease-font-scale');
        });

        this.connect('selection-changed', () => {
            const has_selection = this.get_has_selection();

            if (has_selection && this.copy_on_selection)
                this.copy_clipboard_format(Vte.Format.TEXT);

            if (this.#has_selection !== has_selection) {
                this.#has_selection = has_selection;
                this.notify('has-selection');
            }
        });

        this.#url_prefix = new Map();

        this.connect('notify::url-detect-patterns', this.#setup_url_detect.bind(this));
        this.#setup_url_detect();

        this.#gesture_single = new Gtk.GestureSingle({
            button: 0,
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });

        this.add_controller(this.#gesture_single);

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const handler =
            this.#gesture_single.connect('begin', this.#hyperlink_click.bind(this));

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.#gesture_single.disconnect(handler);
        });
    }

    get child_pid() {
        return this.#child_pid;
    }

    get has_selection() {
        return this.#has_selection;
    }

    set colors(value) {
        this.set_colors(value.foreground, value.background, value.palette);
    }

    set_colors(foreground, background, palette) {
        this.#foreground_from_style = foreground === null;
        this.#background_from_style = background === null;

        if (this.#foreground_from_style || this.#background_from_style) {
            const style = this.get_style_context();
            const state = style.get_state();

            foreground = style.get_property('color', state);
            background = style.get_property('background-color', state).copy();
            background.alpha = this.background_opacity;
        }

        super.set_colors(foreground, background, palette);
    }

    set color_foreground(value) {
        this.set_color_foreground(value);
    }

    set_color_foreground(value) {
        this.#foreground_from_style = value === null;

        if (this.#foreground_from_style) {
            const style = this.get_style_context();
            const state = style.get_state();

            value = style.get_property('color', state);
        }

        super.set_color_foreground(value);
    }

    set color_background(value) {
        this.set_color_background(value);
    }

    set_color_background(value) {
        this.#background_from_style = value === null;

        if (this.#background_from_style) {
            const style = this.get_style_context();
            const state = style.get_state();

            value = style.get_property('background-color', state).copy();
            value.alpha = this.background_opacity;
        }

        super.set_color_background(value);
    }

    on_style_updated() {
        // VTE bug? https://github.com/ddterm/gnome-shell-extension-ddterm/issues/674
        this.set_font(this.get_font());

        if (!this.#foreground_from_style && !this.#background_from_style)
            return;

        const style = this.get_style_context();
        const state = style.get_state();

        if (this.#foreground_from_style)
            super.set_color_foreground(style.get_property('color', state));

        if (this.#background_from_style) {
            const value = style.get_property('background-color', state);
            value.alpha = this.background_opacity;
            super.set_color_background(value);
        }
    }

    set color_bold(value) {
        this.set_color_bold(value);
    }

    set color_cursor(value) {
        this.set_color_cursor(value);
    }

    set color_cursor_foreground(value) {
        this.set_color_cursor_foreground(value);
    }

    set color_highlight(value) {
        this.set_color_highlight(value);
    }

    set color_highlight_foreground(value) {
        this.set_color_highlight_foreground(value);
    }

    get can_increase_font_scale() {
        return find_larger_zoom_factor(this.font_scale) !== null;
    }

    increase_font_scale() {
        const new_scale = find_larger_zoom_factor(this.font_scale);

        if (new_scale !== null)
            this.font_scale = new_scale;
    }

    get can_decrease_font_scale() {
        return find_smaller_zoom_factor(this.font_scale) !== null;
    }

    decrease_font_scale() {
        const new_scale = find_smaller_zoom_factor(this.font_scale);

        if (new_scale !== null)
            this.font_scale = new_scale;
    }

    get_cwd() {
        const uri = this.current_directory_uri;

        if (uri)
            return Gio.File.new_for_uri(uri);

        try {
            return Gio.File.new_for_path(
                GLib.file_read_link(`/proc/${this.child_pid}/cwd`)
            );
        } catch {
            return null;
        }
    }

    has_foreground_process() {
        const pty = this.get_pty();

        if (!pty)
            return false;

        try {
            return tcgetpgrp(pty.get_fd()) !== this.child_pid;
        } catch (ex) {
            if (!(ex instanceof InterpreterNotFoundError))
                logError(ex, "Can't check foreground process group");

            return false;
        }
    }

    watch_child(pid) {
        super.watch_child(pid);

        this.#child_pid = pid;
        this.notify('child-pid');
    }

    spawn_async(
        pty_flags,
        working_directory,
        argv,
        envv,
        spawn_flags,
        child_setup,
        timeout,
        cancellable,
        callback
    ) {
        let destroyed = false;
        const destroy_handler = this.connect('destroy', () => {
            destroyed = true;
        });

        const callback_wrapper = (...args) => {
            const [terminal_, pid, error_] = args;

            if (!destroyed) {
                this.disconnect(destroy_handler);
                this.#child_pid = pid;
                this.notify('child-pid');
            }

            callback?.(...args);
        };

        super.spawn_async(
            pty_flags,
            working_directory,
            argv,
            envv,
            spawn_flags,
            child_setup,
            timeout,
            cancellable,
            callback_wrapper
        );
    }

    spawn_sync() {
        throw new Error('Not implemented');
    }

    spawn_with_fds_async() {
        throw new Error('Not implemented');
    }

    spawn(command_object, timeout = -1, callback = null) {
        this.spawn_async(
            Vte.PtyFlags.DEFAULT,
            command_object.working_directory?.get_path() ?? null,
            command_object.argv,
            command_object.envv,
            command_object.spawn_flags,
            null,
            timeout,
            null,
            callback
        );
    }

    get last_clicked_hyperlink() {
        return this.#clicked_hyperlink;
    }

    get last_clicked_filename() {
        return this.#clicked_filename;
    }

    #hyperlink_click(gesture, sequence) {
        const event = gesture.get_last_event(sequence);
        const state = event.get_modifier_state();
        const [, x, y] = gesture.get_point(sequence);

        let clicked_hyperlink = this.check_hyperlink_at(x, y);

        if (!clicked_hyperlink) {
            const [url, tag] = this.check_match_at(x, y);

            if (url && tag !== null && this.#url_prefix.has(tag)) {
                const prefix = this.#url_prefix.get(tag);

                if (prefix && !url.toLowerCase().startsWith(prefix))
                    clicked_hyperlink = prefix + url;
                else
                    clicked_hyperlink = url;
            }
        }

        let clicked_filename = null;

        if (clicked_hyperlink) {
            try {
                [clicked_filename] = GLib.filename_from_uri(clicked_hyperlink);
            } catch {
            }
        }

        this.freeze_notify();

        try {
            if (this.#clicked_hyperlink !== clicked_hyperlink) {
                this.#clicked_hyperlink = clicked_hyperlink;
                this.notify('last-clicked-hyperlink');
            }

            if (this.#clicked_filename !== clicked_filename) {
                this.#clicked_filename = clicked_filename;
                this.notify('last-clicked-filename');
            }
        } finally {
            this.thaw_notify();
        }

        if (clicked_hyperlink &&
            (state & Gdk.ModifierType.CONTROL_MASK) &&
            [Gdk.BUTTON_PRIMARY, Gdk.BUTTON_MIDDLE].includes(gesture.get_current_button())
        ) {
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            gesture.reset();

            this.emit('open-hyperlink', clicked_hyperlink);

            return;
        }

        gesture.set_state(Gtk.EventSequenceState.DENIED);
    }

    #setup_url_detect() {
        for (const tag of this.#url_prefix.keys())
            this.match_remove(tag);

        this.#url_prefix.clear();

        for (const [key, { regex, prefix }] of Object.entries(URL_REGEX)) {
            if (!this.url_detect_patterns?.includes(key))
                continue;

            const tag = this.match_add_regex(regex, 0);
            this.match_set_cursor_name(tag, 'pointer');
            this.#url_prefix.set(tag, prefix);
        }
    }

    get_text_selected_async() {
        if (this.get_text_selected)
            return Promise.resolve(this.get_text_selected(Vte.Format.TEXT));

        if (!this.get_has_selection())
            return Promise.resolve('');

        const primary_selection = this.get_display().get_primary_clipboard();
        this.copy_primary();

        return new Promise((resolve, reject) => {
            primary_selection.read_text_async(null, (source, result) => {
                try {
                    resolve(source.read_text_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    get_text() {
        if (this.get_text_format)
            return this.get_text_format(Vte.Format.TEXT);

        if (this.get_text_range_format) {
            const [text] = this.get_text_range_format(
                Vte.Format.TEXT,
                0,
                0,
                this.get_row_count(),
                0
            );

            return text;
        }

        return null;
    }
}

const TerminalTermprop = 'PropertyId' in Vte ? class extends TerminalBase {
    static [GObject.GTypeName] = 'DDTermTerminalTermprop';

    static [GObject.properties] = {
        'window-title': GObject.ParamSpec.string(
            'window-title',
            null,
            null,
            GObject.ParamFlags.READABLE,
            ''
        ),
        'current-directory-uri': GObject.ParamSpec.string(
            'current-directory-uri',
            null,
            null,
            GObject.ParamFlags.READABLE,
            ''
        ),
        'current-file-uri': GObject.ParamSpec.string(
            'current-file-uri',
            null,
            null,
            GObject.ParamFlags.READABLE,
            ''
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.connect(`termprop-changed::${Vte.TERMPROP_XTERM_TITLE}`, () => {
            this.notify('window-title');
        });

        this.connect(`termprop-changed::${Vte.TERMPROP_CURRENT_DIRECTORY_URI}`, () => {
            this.notify('current-directory-uri');
        });

        this.connect(`termprop-changed::${Vte.TERMPROP_CURRENT_FILE_URI}`, () => {
            this.notify('current-file-uri');
        });
    }

    get window_title() {
        const [value] = this.get_termprop_string_by_id(Vte.PropertyId.XTERM_TITLE);

        return value  ?? '';
    }

    get current_directory_uri() {
        return this.ref_termprop_uri_by_id(Vte.PropertyId.CURRENT_DIRECTORY_URI)?.to_string() ?? '';
    }

    get current_file_uri() {
        return this.ref_termprop_uri_by_id(Vte.PropertyId.CURRENT_FILE_URI)?.to_string() ?? '';
    }
} : null;

export class Terminal extends (TerminalTermprop ?? TerminalBase) {
    static [GObject.GTypeName] = 'DDTermTerminal';

    static {
        GObject.registerClass(this);
    }
}
