/*
    Copyright © 2022 Aleksandr Mezin

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

'use strict';

const { GObject, GLib, Gdk, Gio, Pango } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxutil } = Me.imports;
const { rxjs } = Me.imports.rxjs;
const { Handlebars } = Me.imports.handlebars;

function parse_rgba(s) {
    if (!s)
        return null;

    const v = new Gdk.RGBA();

    if (v.parse(s))
        return v;

    return null;
}

function setting_equal(a, b) {
    if (a instanceof GLib.Variant && b instanceof GLib.Variant)
        return a.equal(b);

    return a === b;
}

function share() {
    return rxjs.pipe(
        rxjs.distinctUntilChanged(setting_equal),
        rxjs.shareReplay({ bufferSize: 1, refCount: true })
    );
}

class SettingWritability extends rxutil.ObservableValue {
    constructor(gsettings, key) {
        const change = rxutil.signal(gsettings, `writable-changed::${key}`);

        super(change, change.pipe(rxjs.startWith([gsettings, key])), share());

        this.gsettings = gsettings;
        this.key = key;
    }

    get value() {
        return this.gsettings.is_writable(this.key);
    }
}

class SettingValue extends rxutil.ObservableWritableValue {
    constructor(gsettings, key, change, change_with_initial, writable) {
        super(change, change_with_initial, share());

        this.gsettings = gsettings;
        this.key = key;
        this.writable = writable;
    }

    get value() {
        return this.get_value();
    }

    set value(v) {
        this.set_value(v);
    }

    get_value() {
        return this.gsettings.get_value(this.key);
    }

    set_value(v) {
        return this.gsettings.set_value(this.key, v);
    }

    reset() {
        this.gsettings.reset(this.key);
    }
}

class SettingEnum extends SettingValue {
    get_value() {
        return this.gsettings.get_enum(this.key);
    }

    set_value(v) {
        return this.gsettings.set_enum(this.key, v);
    }
}

class SettingFlags extends SettingValue {
    get_value() {
        return this.gsettings.get_flags(this.key);
    }

    set_value(v) {
        return this.gsettings.set_flags(this.key, v);
    }
}

class Setting extends SettingValue {
    constructor(gsettings, key) {
        const change = rxutil.signal(gsettings, `changed::${key}`);
        const change_with_initial = change.pipe(rxjs.startWith([gsettings, key]));
        const writable = new SettingWritability(gsettings, key);

        super(gsettings, key, change, change_with_initial, writable);

        this.schema_key = gsettings.settings_schema.get_key(key);
        this.value_type = this.schema_key.get_value_type();
        this.type_string = this.value_type.dup_string();

        this.packed = new SettingValue(gsettings, key, change, change_with_initial, writable);

        const [range_type] = this.schema_key.get_range().deepUnpack();

        if (range_type === 'enum')
            this.enum = new SettingEnum(gsettings, key, change, change_with_initial, writable);

        if (range_type === 'flags')
            this.flags = new SettingFlags(gsettings, key, change, change_with_initial, writable);
    }

    get_value() {
        return super.get_value().deepUnpack();
    }

    set_value(v) {
        return super.set_value(new GLib.Variant(this.type_string, v));
    }
}

function setting(gsettings, key) {
    return new Setting(gsettings, key);
}

/* exported setting */

class ColorSetting extends Setting {
    get_value() {
        return parse_rgba(super.get_value());
    }

    set_value(v) {
        return super.set_value(v.to_string());
    }
}

class PaletteSetting extends Setting {
    get_value() {
        return super.get_value().map(parse_rgba);
    }

    set_value(v) {
        return super.set_value(v.map(i => i.to_string()));
    }
}

const CUSTOM_SETTINGS_TYPES = {
    'foreground-color': ColorSetting,
    'background-color': ColorSetting,
    'bold-color': ColorSetting,
    'cursor-background-color': ColorSetting,
    'cursor-foreground-color': ColorSetting,
    'highlight-background-color': ColorSetting,
    'highlight-foreground-color': ColorSetting,
    'palette': PaletteSetting,
};

var Settings = GObject.registerClass(
    {
        Properties: {
            'gsettings': GObject.ParamSpec.object(
                'gsettings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
        },
    },
    class DDTermSettings extends GObject.Object {
        _init(params) {
            super._init(params);

            for (const key of this.gsettings.settings_schema.list_keys()) {
                const setting_type = CUSTOM_SETTINGS_TYPES[key] || Setting;
                this[key] = new setting_type(this.gsettings, key);
            }

            const invert_bool = rxjs.map(v => !v);

            const use_custom_colors = this['use-theme-colors'].pipe(invert_bool);
            const diable_bold_color = this['bold-color-same-as-fg'].pipe(
                rxutil.enable_if(use_custom_colors, rxjs.of(true))
            );
            const enable_cursor_colors = this['cursor-colors-set'].pipe(
                rxutil.enable_if(use_custom_colors, rxjs.of(false))
            );
            const enable_highlight_colors = this['highlight-colors-set'].pipe(
                rxutil.enable_if(use_custom_colors, rxjs.of(false))
            );

            this.enable = {
                'scrollback-lines': this['scrollback-unlimited'].pipe(invert_bool),
                'custom-font': this['use-system-font'].pipe(invert_bool),
                'background-opacity': this['transparent-background'],

                'foreground-color': use_custom_colors,
                'background-color': use_custom_colors,

                'bold-color-same-as-fg': use_custom_colors,
                'bold-color': diable_bold_color.pipe(invert_bool),

                'cursor-colors-set': use_custom_colors,
                'cursor-background-color': enable_cursor_colors,
                'cursor-foreground-color': enable_cursor_colors,

                'highlight-colors-set': use_custom_colors,
                'highlight-background-color': enable_highlight_colors,
                'highlight-foreground-color': enable_highlight_colors,

                'detect-urls-as-is': this['detect-urls'],
                'detect-urls-file': this['detect-urls'],
                'detect-urls-http': this['detect-urls'],
                'detect-urls-voip': this['detect-urls'],
                'detect-urls-email': this['detect-urls'],
                'detect-urls-news-man': this['detect-urls'],

                'custom-command': this['command'].pipe(
                    rxjs.map(mode => mode === 'custom-command')
                ),

                'show-animation': this['override-window-animation'],
                'hide-animation': this['override-window-animation'],
                'show-animation-duration': this['override-window-animation'],
                'hide-animation-duration': this['override-window-animation'],

                'window-monitor-connector': this['window-monitor'].pipe(
                    rxjs.map(v => v === 'connector')
                ),
            };

            const desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });

            const system_font = setting(desktop_settings, 'monospace-font-name');
            const font_resolved = this.resolve('custom-font', system_font);

            let system_color_scheme = rxjs.of('default');

            if (desktop_settings.settings_schema.has_key('color-scheme')) {
                system_color_scheme = setting(desktop_settings, 'color-scheme').pipe(
                    rxjs.map(variant => {
                        if (variant === 'prefer-light')
                            return 'light';

                        if (variant === 'prefer-dark')
                            return 'dark';

                        if (variant !== 'default') {
                            printerr(
                                `Unknown ${desktop_settings.schema_id}.color-scheme: ${variant}`
                            );
                        }

                        return 'default';
                    })
                );
            }

            const theme_variant_resolved = this['theme-variant'].pipe(
                rxjs.switchMap(variant => {
                    if (variant === 'system')
                        return system_color_scheme;

                    return rxjs.of(variant);
                }),
                share()
            );

            this.resolved = {
                'scrollback-lines': this.resolve('scrollback-lines', rxjs.of(-1)),
                'background-opacity': this.resolve('background-opacity', rxjs.of(1)),
                'font': font_resolved,
                'font-desc': font_resolved.pipe(
                    rxjs.map(desc => Pango.FontDescription.from_string(desc)),
                    share()
                ),
                'theme-variant': theme_variant_resolved,
            };

            [
                'bold-color',
                'cursor-background-color',
                'cursor-foreground-color',
                'highlight-background-color',
                'highlight-foreground-color',
            ].forEach(key => {
                this.resolved[key] = this.resolve(key, rxjs.of(null));
            });

            [
                'detect-urls-as-is',
                'detect-urls-file',
                'detect-urls-http',
                'detect-urls-voip',
                'detect-urls-email',
                'detect-urls-news-man',
            ].forEach(key => {
                this.resolved[key] = this.resolve(key, rxjs.of(false));
            });

            this.fallback_title_template = Handlebars.compile(
                this['tab-title-template'].schema_key.get_default_value().unpack()
            );

            this.title_template_compiled = this['tab-title-template'].pipe(
                rxjs.map(template => {
                    try {
                        return Handlebars.compile(template);
                    } catch {
                        return this.fallback_title_template;
                    }
                }),
                share()
            );
        }

        resolve(key, disabled) {
            return rxutil.switch_on(this.enable[key], {
                true: this[key],
                false: disabled,
            });
        }

        resolved_foreground_color(style_color) {
            return this.resolve('foreground-color', style_color);
        }

        resolved_background_color(style_color) {
            return this.resolve('background-color', style_color).pipe(
                rxjs.combineLatestWith(this.resolved['background-opacity']),
                rxjs.map(([color, opacity]) => {
                    color = color.copy();
                    color.alpha = opacity;
                    return color;
                })
            );
        }
    }
);

/* exported Settings */
