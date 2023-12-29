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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Vte from 'gi://Vte';

import { tcgetpgrp, InterpreterNotFoundError } from './tcgetpgrp.js';
import { UrlDetect } from './urldetect.js';

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
        '',
        '',
        flags,
        Gdk.RGBA
    );
}

export const TerminalColors = GObject.registerClass({
    Properties: Object.fromEntries(
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
    ),
}, class DDTermTerminalColors extends GObject.Object {
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
});

export const TerminalCommand = GObject.registerClass({
    Properties: {
        'argv': GObject.ParamSpec.boxed(
            'argv',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'envv': GObject.ParamSpec.boxed(
            'envv',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'working-directory': GObject.ParamSpec.object(
            'working-directory',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.File
        ),
        'search-path': GObject.ParamSpec.boolean(
            'search-path',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            true
        ),
        'file-and-argv-zero': GObject.ParamSpec.boolean(
            'file-and-argv-zero',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            false
        ),
    },
}, class DDTermTerminalCommand extends GObject.Object {
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
        const [_, argv] = GLib.shell_parse_argv(command);

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
            dict.insert_value(
                'working-directory',
                GLib.Variant.new_string(this.working_directory.get_path())
            );
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
});

export const Terminal = GObject.registerClass({
    Properties: {
        'colors': GObject.ParamSpec.object(
            'colors',
            '',
            '',
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
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            1,
            1
        ),
        'url-detect-patterns': GObject.ParamSpec.boxed(
            'url-detect-patterns',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'child-pid': GObject.ParamSpec.int(
            'child-pid',
            '',
            '',
            GObject.ParamFlags.READABLE,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'last-clicked-hyperlink': GObject.ParamSpec.string(
            'last-clicked-hyperlink',
            '',
            '',
            GObject.ParamFlags.READABLE,
            null
        ),
        'last-clicked-filename': GObject.ParamSpec.string(
            'last-clicked-filename',
            '',
            '',
            GObject.ParamFlags.READABLE,
            null
        ),
        'can-increase-font-scale': GObject.ParamSpec.boolean(
            'can-increase-font-scale',
            '',
            '',
            GObject.ParamFlags.READABLE,
            true
        ),
        'can-decrease-font-scale': GObject.ParamSpec.boolean(
            'can-decrease-font-scale',
            '',
            '',
            GObject.ParamFlags.READABLE,
            true
        ),
    },
}, class DDTermTerminal extends Vte.Terminal {
    _init(params) {
        this._foreground_from_style = false;
        this._background_from_style = false;
        this._child_pid = 0;
        this._clicked_filename = null;
        this._clicked_hyperlink = null;

        super._init(params);

        this._url_detect = new UrlDetect({
            terminal: this,
            enabled_patterns: this.url_detect_patterns,
        });

        this.bind_property(
            'url-detect-patterns',
            this._url_detect,
            'enabled-patterns',
            GObject.BindingFlags.DEFAULT
        );

        this.connect(
            'button-press-event',
            this._update_clicked_hyperlink.bind(this)
        );

        this.connect('notify::background-opacity', () => {
            if (this._background_from_style)
                this.set_color_background(null);
        });

        if (this._background_from_style)
            this.set_color_background(null);

        this.connect('notify::font-scale', () => {
            this.notify('can-increase-font-scale');
            this.notify('can-decrease-font-scale');
        });
    }

    get child_pid() {
        return this._child_pid;
    }

    set colors(value) {
        this.set_colors(value.foreground, value.background, value.palette);
    }

    set_colors(foreground, background, palette) {
        this._foreground_from_style = foreground === null;
        this._background_from_style = background === null;

        if (this._foreground_from_style || this._background_from_style) {
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
        this._foreground_from_style = value === null;

        if (this._foreground_from_style) {
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
        this._background_from_style = value === null;

        if (this._background_from_style) {
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

        if (!this._foreground_from_style && !this._background_from_style)
            return;

        const style = this.get_style_context();
        const state = style.get_state();

        if (this._foreground_from_style)
            super.set_color_foreground(style.get_property('color', state));

        if (this._background_from_style) {
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

        this._child_pid = pid;
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
        const callback_wrapper = (...args) => {
            const [terminal_, pid, error_] = args;

            this._child_pid = pid;
            this.notify('child-pid');

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
        return this._clicked_hyperlink;
    }

    get last_clicked_filename() {
        return this._clicked_filename;
    }

    _update_clicked_hyperlink(terminal_, event) {
        let clicked_hyperlink = this.hyperlink_check_event(event);

        if (!clicked_hyperlink && this._url_detect)
            clicked_hyperlink = this._url_detect.check_event(event);

        let clicked_filename = null;

        if (clicked_hyperlink) {
            try {
                clicked_filename = GLib.filename_from_uri(clicked_hyperlink)[0];
            } catch {
            }
        }

        this.freeze_notify();

        try {
            if (this._clicked_hyperlink !== clicked_hyperlink) {
                this._clicked_hyperlink = clicked_hyperlink;
                this.notify('last-clicked-hyperlink');
            }

            if (this._clicked_filename !== clicked_filename) {
                this._clicked_filename = clicked_filename;
                this.notify('last-clicked-filename');
            }
        } finally {
            this.thaw_notify();
        }
    }
});
