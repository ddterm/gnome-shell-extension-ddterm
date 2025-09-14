// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Jing Yen Loh
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Pango from 'gi://Pango';

import { Terminal, TerminalColors, TerminalCommand } from './terminal.js';
import { PATTERN_NAMES } from './urldetect.js';

const DEFAULT_FLAGS = GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY;

function clone_pspec(source, flags = DEFAULT_FLAGS) {
    const fundamental = GObject.type_fundamental(source.value_type);

    const common_args = [
        source.get_name(),
        source.get_nick(),
        source.get_blurb(),
        flags,
    ];

    switch (fundamental) {
    case GObject.TYPE_BOOLEAN:
        return GObject.ParamSpec.boolean(...common_args, source.get_default_value());

    case GObject.TYPE_BOXED:
        return GObject.ParamSpec.boxed(...common_args, source.value_type);

    case GObject.TYPE_OBJECT:
        return GObject.ParamSpec.object(...common_args, source.value_type);

    case GObject.TYPE_ENUM:
        return GObject.ParamSpec.enum(
            ...common_args,
            source.value_type,
            source.get_default_value()
        );

    default:
        throw Error(`Type ${source.value_type} (fundamental ${fundamental}) not supported`);
    }
}

function parse_rgba(str) {
    if (str) {
        const rgba = new Gdk.RGBA();

        if (rgba.parse(str))
            return rgba;
    }

    throw Error(`Cannot parse ${JSON.stringify(str)} as color`);
}

const PROPERTIES_CLONE = [
    'scroll-on-output',
    'scroll-on-keystroke',
    'allow-hyperlink',
    'audible-bell',
    'bold-is-bright',
    'pointer-autohide',
    'text-blink-mode',
    'cursor-blink-mode',
    'cursor-shape',
    'backspace-binding',
    'delete-binding',
    'font-desc',
    'colors',
    'color-bold',
    'color-cursor',
    'color-cursor-foreground',
    'color-highlight',
    'color-highlight-foreground',
    'url-detect-patterns',
];

const TERMINAL_PSPECS = Object.fromEntries(
    GObject.Object.list_properties.call(Terminal).map(
        pspec => [pspec.get_name(), pspec]
    )
);

const CLONED_PSPECS = Object.fromEntries(
    PROPERTIES_CLONE.map(
        name => [name, clone_pspec(TERMINAL_PSPECS[name])]
    )
);

export const Command = {
    USER_SHELL: 'user-shell',
    USER_SHELL_LOGIN: 'user-shell-login',
    CUSTOM_COMMAND: 'custom-command',
};

export const TerminalSettings = GObject.registerClass({
    Properties: {
        ...CLONED_PSPECS,
        'cjk-ambiguous-width': GObject.ParamSpec.int(
            'cjk-ambiguous-width',
            null,
            null,
            DEFAULT_FLAGS,
            1,
            2,
            TERMINAL_PSPECS['cjk-ambiguous-width'].get_default_value()
        ),
        'scrollback-lines': GObject.ParamSpec.uint(
            'scrollback-lines',
            null,
            null,
            DEFAULT_FLAGS,
            0,
            GLib.MAXUINT32,
            TERMINAL_PSPECS['scrollback-lines'].get_default_value()
        ),
        'show-scrollbar': GObject.ParamSpec.boolean(
            'show-scrollbar',
            null,
            null,
            DEFAULT_FLAGS,
            true
        ),
        // has effect only when background color from style is used
        'background-opacity': GObject.ParamSpec.double(
            'background-opacity',
            null,
            null,
            DEFAULT_FLAGS,
            0,
            1,
            1
        ),
        'command': GObject.ParamSpec.string(
            'command',
            null,
            null,
            DEFAULT_FLAGS,
            Command.USER_SHELL
        ),
        'custom-command': GObject.ParamSpec.string(
            'custom-command',
            null,
            null,
            DEFAULT_FLAGS,
            ''
        ),
        'preserve-working-directory': GObject.ParamSpec.boolean(
            'preserve-working-directory',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
    },
}, class DDTermTerminalSettings extends GObject.Object {
    bind_terminal(to_terminal) {
        return new TerminalSettingsBinding({
            terminal: to_terminal,
            settings: this,
        });
    }

    get_command(working_directory = null, envv = null) {
        switch (this.command) {
        case Command.CUSTOM_COMMAND:
            return TerminalCommand.parse(this.custom_command, working_directory, envv);

        case Command.USER_SHELL_LOGIN:
            return TerminalCommand.login_shell(working_directory, envv);

        case Command.USER_SHELL:
            return TerminalCommand.shell(working_directory, envv);

        default:
            throw new Error(`Unknown command type ${this.command}`);
        }
    }
});

const MultiBinding = GObject.registerClass({
}, class DDTermTerminalSettingsMultiBinding extends GObject.Object {
    _init(params) {
        super._init(params);

        this._unbind = [];
    }

    add_property_binding(source, target, name) {
        const binding =
            source.bind_property(name, target, name, GObject.BindingFlags.SYNC_CREATE);

        this._unbind.push(() => binding.unbind());
    }

    add_gsettings_binding(settings, target, key) {
        settings.bind(key, target, key, Gio.SettingsBindFlags.GET);

        this._unbind.push(() => Gio.Settings.unbind(this.settings, key));
    }

    unbind() {
        while (this._unbind.length > 0)
            this._unbind.pop()();
    }
});

export const TerminalSettingsBinding = GObject.registerClass({
    Properties: {
        'terminal': GObject.ParamSpec.object(
            'terminal',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Terminal
        ),
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
    },
}, class DDTermTerminalSettingsBinding extends MultiBinding {
    _init(params) {
        super._init(params);

        GObject.Object.list_properties.call(TerminalSettings).forEach(pspec => {
            if (GObject.Object.find_property.call(Terminal, pspec.name))
                this.add_property_binding(this.settings, this.terminal, pspec.name);
        });
    }
});

export const TerminalSettingsParser = GObject.registerClass({
    Properties: {
        'gsettings': GObject.ParamSpec.object(
            'gsettings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'desktop-settings': GObject.ParamSpec.object(
            'desktop-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'cjk-ambiguous-width': GObject.ParamSpec.int(
            'cjk-ambiguous-width',
            null,
            null,
            GObject.ParamFlags.READABLE,
            1,
            2,
            TerminalSettings[GObject.properties]['cjk-ambiguous-width'].get_default_value()
        ),
        'scrollback-lines': GObject.ParamSpec.uint(
            'scrollback-lines',
            null,
            null,
            GObject.ParamFlags.READABLE,
            0,
            GLib.MAXUINT32,
            TerminalSettings[GObject.properties]['scrollback-lines'].get_default_value()
        ),
        // has effect only when background color from style is used
        'background-opacity': GObject.ParamSpec.double(
            'background-opacity',
            null,
            null,
            GObject.ParamFlags.READABLE,
            0,
            1,
            1
        ),
        'font-desc': clone_pspec(
            TerminalSettings[GObject.properties]['font-desc'],
            GObject.ParamFlags.READABLE
        ),
        'colors': clone_pspec(
            TerminalSettings[GObject.properties]['colors'],
            GObject.ParamFlags.READABLE
        ),
        'color-bold': clone_pspec(
            TerminalSettings[GObject.properties]['color-bold'],
            GObject.ParamFlags.READABLE
        ),
        'color-cursor': clone_pspec(
            TerminalSettings[GObject.properties]['color-cursor'],
            GObject.ParamFlags.READABLE
        ),
        'color-cursor-foreground': clone_pspec(
            TerminalSettings[GObject.properties]['color-cursor-foreground'],
            GObject.ParamFlags.READABLE
        ),
        'color-highlight': clone_pspec(
            TerminalSettings[GObject.properties]['color-highlight'],
            GObject.ParamFlags.READABLE
        ),
        'color-highlight-foreground': clone_pspec(
            TerminalSettings[GObject.properties]['color-highlight-foreground'],
            GObject.ParamFlags.READABLE
        ),
        'url-detect-patterns': clone_pspec(
            TerminalSettings[GObject.properties]['url-detect-patterns'],
            GObject.ParamFlags.READABLE
        ),
    },
    Signals: {
        'destroy': {},
    },
}, class DDTermTerminalSettingsParser extends GObject.Object {
    _init(params) {
        super._init(params);

        this.add_dependency('cjk-utf8-ambiguous-width', 'cjk-ambiguous-width');

        this.add_dependency('scrollback-lines', 'scrollback-lines');
        this.add_dependency('scrollback-unlimited', 'scrollback-lines');

        const system_font_handler = this.desktop_settings.connect(
            'changed::monospace-font-name',
            () => this.notify('font-desc')
        );
        this.connect('destroy', () => this.desktop_settings.disconnect(system_font_handler));

        this.add_dependency('custom-font', 'font-desc');
        this.add_dependency('use-system-font', 'font-desc');

        this.add_dependency('transparent-background', 'background-opacity');
        this.add_dependency('background-opacity', 'background-opacity');

        this.add_dependency('transparent-background', 'colors');
        this.add_dependency('background-opacity', 'colors');
        this.add_dependency('use-theme-colors', 'colors');
        this.add_dependency('foreground-color', 'colors');
        this.add_dependency('background-color', 'colors');
        this.add_dependency('palette', 'colors');

        this.add_dependency('use-theme-colors', 'color-bold');
        this.add_dependency('bold-color-same-as-fg', 'color-bold');
        this.add_dependency('bold-color', 'color-bold');

        this.add_dependency('cursor-colors-set', 'color-cursor');
        this.add_dependency('cursor-background-color', 'color-cursor');

        this.add_dependency('cursor-colors-set', 'color-cursor-foreground');
        this.add_dependency('cursor-foreground-color', 'color-cursor-foreground');

        this.add_dependency('highlight-colors-set', 'color-highlight');
        this.add_dependency('highlight-background-color', 'color-highlight');

        this.add_dependency('highlight-colors-set', 'color-highlight-foreground');
        this.add_dependency('highlight-foreground-color', 'color-highlight-foreground');

        for (const key of ['detect-urls', ...PATTERN_NAMES])
            this.add_dependency(key, 'url-detect-patterns');
    }

    add_dependency(gsettings_key, property) {
        const handler = this.gsettings.connect(
            `changed::${gsettings_key}`,
            () => this.notify(property)
        );

        this.connect('destroy', () => this.disconnect(handler));
    }

    get cjk_ambiguous_width() {
        return this.gsettings.get_enum('cjk-utf8-ambiguous-width');
    }

    get scrollback_lines() {
        if (this.gsettings.get_boolean('scrollback-unlimited'))
            return -1;

        return this.gsettings.get_int('scrollback-lines');
    }

    get font_desc() {
        if (this.gsettings.get_boolean('use-system-font')) {
            return Pango.FontDescription.from_string(
                this.desktop_settings.get_string('monospace-font-name')
            );
        }

        return Pango.FontDescription.from_string(this.gsettings.get_string('custom-font'));
    }

    get background_opacity() {
        if (!this.gsettings.get_boolean('transparent-background'))
            return 1;

        return this.gsettings.get_double('background-opacity');
    }

    get colors() {
        let foreground = null, background = null;

        if (!this.gsettings.get_boolean('use-theme-colors')) {
            foreground = parse_rgba(this.gsettings.get_string('foreground-color'));
            background = parse_rgba(this.gsettings.get_string('background-color'));
            background.alpha = this.background_opacity;
        }

        const palette = this.gsettings.get_strv('palette').map(parse_rgba);

        return TerminalColors.new(foreground, background, palette);
    }

    get color_bold() {
        if (this.gsettings.get_boolean('use-theme-colors'))
            return null;

        if (this.gsettings.get_boolean('bold-color-same-as-fg'))
            return null;

        return parse_rgba(this.gsettings.get_string('bold-color'));
    }

    get color_cursor() {
        if (this.gsettings.get_boolean('use-theme-colors'))
            return null;

        if (!this.gsettings.get_boolean('cursor-colors-set'))
            return null;

        return parse_rgba(this.gsettings.get_string('cursor-background-color'));
    }

    get color_cursor_foreground() {
        if (this.gsettings.get_boolean('use-theme-colors'))
            return null;

        if (!this.gsettings.get_boolean('cursor-colors-set'))
            return null;

        return parse_rgba(this.gsettings.get_string('cursor-foreground-color'));
    }

    get color_highlight() {
        if (this.gsettings.get_boolean('use-theme-colors'))
            return null;

        if (!this.gsettings.get_boolean('highlight-colors-set'))
            return null;

        return parse_rgba(this.gsettings.get_string('highlight-background-color'));
    }

    get color_highlight_foreground() {
        if (this.gsettings.get_boolean('use-theme-colors'))
            return null;

        if (!this.gsettings.get_boolean('highlight-colors-set'))
            return null;

        return parse_rgba(this.gsettings.get_string('highlight-foreground-color'));
    }

    get url_detect_patterns() {
        if (!this.gsettings.get_boolean('detect-urls'))
            return null;

        const flags = [];

        for (const name of PATTERN_NAMES) {
            if (this.gsettings.get_boolean(name))
                flags.push(name);
        }

        return flags;
    }

    destroy() {
        this.emit('destroy');
    }

    bind_settings(settings) {
        return new TerminalSettingsParserBinding({
            settings,
            parser: this,
        });
    }
});

export const TerminalSettingsParserBinding = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'parser': GObject.ParamSpec.object(
            'parser',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettingsParser
        ),
    },
}, class DDTermTerminalSettingsParserBinding extends MultiBinding {
    _init(params) {
        super._init(params);

        GObject.Object.list_properties.call(TerminalSettings).forEach(pspec => {
            if (GObject.Object.find_property.call(TerminalSettingsParser, pspec.name))
                this.add_property_binding(this.parser, this.settings, pspec.name);
            else
                this.add_gsettings_binding(this.parser.gsettings, this.settings, pspec.name);
        });
    }
});
