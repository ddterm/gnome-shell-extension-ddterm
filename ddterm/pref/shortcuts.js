// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Mohammad Javad Naderi
// SPDX-FileContributor: Juan M. Cruz-Martinez
// SPDX-FileContributor: Jackson Goode
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, ActionRow } from './util.js';

const IS_GTK3 = Gtk.get_major_version() === 3;

function inhibit_system_shortcuts_gtk3(widget) {
    const seat = widget.get_display().get_default_seat();

    return seat.grab(
        widget.get_toplevel().get_window(),
        Gdk.SeatCapabilities.KEYBOARD,
        false,
        null,
        null,
        null
    ) === Gdk.GrabStatus.SUCCESS;
}

function restore_system_shortcuts_gtk3(widget) {
    const seat = widget.get_display().get_default_seat();

    seat.ungrab();
}

function inhibit_system_shortcuts_gtk4(widget) {
    const toplevel = widget.root.get_surface();

    toplevel.inhibit_system_shortcuts(null);

    return true;
}

function restore_system_shortcuts_gtk4(widget) {
    const toplevel = widget.root.get_surface();

    toplevel.restore_system_shortcuts();
}

function translate_key_gtk3(display, keycode, state, group) {
    const keymap = Gdk.Keymap.get_for_display(display);

    return keymap.translate_keyboard_state(keycode, state, group);
}

function translate_key_gtk4(display, keycode, state, group) {
    return display.translate_key(keycode, state, group);
}

const inhibit_system_shortcuts =
    IS_GTK3 ? inhibit_system_shortcuts_gtk3 : inhibit_system_shortcuts_gtk4;

const restore_system_shortcuts =
    IS_GTK3 ? restore_system_shortcuts_gtk3 : restore_system_shortcuts_gtk4;

const accelerator_parse = IS_GTK3 ? Gtk.accelerator_parse : v => Gtk.accelerator_parse(v).slice(1);
const translate_key = IS_GTK3 ? translate_key_gtk3 : translate_key_gtk4;

function normalize_keyval_and_mask(display, keycode, mask, group) {
    const explicit_modifiers =
        Gtk.accelerator_get_default_mod_mask() | Gdk.ModifierType.SHIFT_MASK;

    let [, unmodified_keyval] = translate_key(
        display,
        keycode,
        mask & ~explicit_modifiers,
        group
    );

    const [, shifted_keyval] = translate_key(
        display,
        keycode,
        (mask & ~explicit_modifiers) | Gdk.ModifierType.SHIFT_MASK,
        group
    );

    if (shifted_keyval >= Gdk.KEY_0 && shifted_keyval <= Gdk.KEY_9)
        unmodified_keyval = shifted_keyval;

    if (unmodified_keyval === Gdk.KEY_ISO_Left_Tab)
        unmodified_keyval = Gdk.KEY_Tab;

    return [unmodified_keyval, mask & explicit_modifiers];
}

class ShortcutEditDialog extends Gtk.Dialog {
    static [GObject.GTypeName] = 'DDTermShortcutEditDialog';

    static [GObject.properties] = {
        'accelerator': GObject.ParamSpec.string(
            'accelerator',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'validate': GObject.ParamSpec.boolean(
            'validate',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            true
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static [GObject.signals] = {
        'stopped': {},
    };

    static {
        GObject.registerClass(this);
    }

    #controller;
    #label;

    constructor(params) {
        super({
            use_header_bar: true,
            ...params,
        });

        if (Gtk.EventControllerKey.new.length === 1) {
            this.#controller = Gtk.EventControllerKey.new(this);
        } else {
            this.#controller = Gtk.EventControllerKey.new();
            this.add_controller(this.#controller);
        }

        this.#controller.propagation_phase = Gtk.PropagationPhase.CAPTURE;

        const margins = {
            margin_top: 16,
            margin_bottom: 16,
            margin_start: 16,
            margin_end: 16,
        };

        this.#label = new Gtk.ShortcutLabel({
            visible: true,
            disabled_text: this.gettext_domain.gettext('Enter new shortcut'),
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            ...margins,
        });

        this.#append(this.#label);

        const help_label = new Gtk.Label({
            visible: true,
            label: this.gettext_domain.gettext(
                'Press Esc to cancel or Backspace to disable the keyboard shortcut'
            ),
            ...margins,
        });

        this.connect('stopped', () => {
            help_label.visible = false;
        });

        this.#append(help_label);

        this.add_button(this.gettext_domain.gettext('Cancel'), Gtk.ResponseType.CANCEL);
        this.add_button(this.gettext_domain.gettext('Set'), Gtk.ResponseType.OK);
        this.set_response_sensitive(Gtk.ResponseType.OK, false);
        this.set_default_response(Gtk.ResponseType.OK);

        this.connect('realize', this.#realize.bind(this));
    }

    #append(widget) {
        const content_area = this.get_content_area();

        if (content_area.add)
            content_area.add(widget);
        else
            content_area.append(widget);
    }

    #realize() {
        const controller_handlers = [
            this.#controller.connect('key-pressed', this.#key_pressed.bind(this)),
            this.#controller.connect('key-released', this.#key_released.bind(this)),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.emit('stopped');
        });

        this.connect('stopped', () => {
            this.disconnect(unrealize_handler);

            for (const handler of controller_handlers)
                this.#controller.disconnect(handler);
        });
    }

    #key_pressed(controller, keyval, keycode, state) {
        const [keyval_lower, real_mask] =
            normalize_keyval_and_mask(this.get_display(), keycode, state, controller.get_group());

        if (!real_mask) {
            if (keyval_lower === Gdk.KEY_Escape)
                return false;

            if (keyval_lower === Gdk.KEY_BackSpace) {
                this.emit('stopped');
                this.#label.accelerator = null;
                this.response(Gtk.ResponseType.OK);

                return true;
            }
        }

        this.#update_accelerator(keyval_lower, real_mask);

        return true;
    }

    #key_released(controller, keyval, keycode, state) {
        const [keyval_lower, real_mask] =
            normalize_keyval_and_mask(this.get_display(), keycode, state, controller.get_group());

        this.#update_accelerator(keyval_lower, real_mask);

        if (this.validate && !Gtk.accelerator_valid(keyval_lower, real_mask))
            return;

        this.emit('stopped');
        this.set_response_sensitive(Gtk.ResponseType.OK, true);
        this.get_widget_for_response(Gtk.ResponseType.OK).grab_focus();
    }

    #update_accelerator(keyval, state) {
        const name = Gtk.accelerator_name(keyval, state);

        if (name === this.#label.accelerator)
            return;

        this.#label.accelerator = name;
        this.notify('accelerator');
    }

    get accelerator() {
        return this.#label.accelerator;
    }
}

class ShortcutRow extends ActionRow {
    static [GObject.GTypeName] = 'DDTermShortcutRow';

    static [GObject.properties] = {
        'value': GObject.ParamSpec.boxed(
            'value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'global': GObject.ParamSpec.boolean(
            'global',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            false
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static [GObject.signals] = {
        'accelerator-set': {},
    };

    static {
        GObject.registerClass(this);
    }

    #labels;

    constructor(params) {
        super(params);

        this.#labels = [];

        this.connect('notify::value', this.#update.bind(this));
        this.#update();

        this.connect('activated', this.#edit.bind(this));
    }

    #update() {
        const { value } = this;
        const n = Math.max(1, value.length);

        while (this.#labels.length > n)
            this.remove(this.#labels.pop());

        for (let i = 0; i < n; i++) {
            const accelerator = value[i] || null;

            if (i < this.#labels.length) {
                this.#labels[i].accelerator = accelerator;
                continue;
            }

            const label = new Gtk.ShortcutLabel({
                visible: true,
                disabled_text: this.gettext_domain.gettext('Disabled'),
                accelerator,
                valign: Gtk.Align.CENTER,
            });

            if (this.add_suffix)
                this.add_suffix(label);
            else
                this.add(label);

            this.#labels.push(label);
        }
    }

    #edit() {
        const dialog = new ShortcutEditDialog({
            title: this.title,
            gettext_domain: this.gettext_domain,
            transient_for: this.get_root?.() ?? this.get_toplevel?.(),
            modal: true,
            validate: !this.global,
        });

        dialog.connect('response', (_, response_id) => {
            if (response_id === Gtk.ResponseType.OK) {
                this.value = dialog.accelerator ? [dialog.accelerator] : [];
                this.emit('accelerator-set');
            }

            dialog.destroy();
        });

        if (this.global)
            ShortcutRow.#setup_inhibit_system_shortcuts(dialog);

        dialog.present();
    }

    static #setup_inhibit_system_shortcuts(dialog) {
        const map_handler = dialog.connect_after('map', () => {
            dialog.disconnect(map_handler);

            if (!inhibit_system_shortcuts(dialog))
                return;

            const stop_handler = dialog.connect('stopped', () => {
                dialog.disconnect(stop_handler);
                restore_system_shortcuts(dialog);
            });
        });
    }

    remove_conflict(keyval, modifiers) {
        keyval = Gdk.keyval_to_lower(keyval);
        modifiers &= Gtk.accelerator_get_default_mod_mask();

        const filtered = this.value.filter(accel => {
            let [parsed_keyval, parsed_modifiers] = accelerator_parse(accel);

            parsed_keyval = Gdk.keyval_to_lower(parsed_keyval);
            parsed_modifiers &= Gtk.accelerator_get_default_mod_mask();

            return parsed_keyval !== keyval || parsed_modifiers !== modifiers;
        });

        if (filtered.length !== this.value.length)
            this.value = filtered;
    }
}

class ShortcutGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermShortcutGroup';

    static [GObject.signals] = {
        'accelerator-set': {
            param_types: [GObject.TYPE_UINT, Gdk.ModifierType],
        },
        'reset': {},
    };

    static {
        GObject.registerClass(this);
    }

    add_shortcut_row({ key, flags = Gio.SettingsBindFlags.DEFAULT, ...params }) {
        const row = new ShortcutRow({
            visible: true,
            gettext_domain: this.gettext_domain,
            use_underline: true,
            activatable: true,
            ...params,
        });

        this.settings.bind(key, row, 'value', flags);

        const conflict_handler = this.connect('accelerator-set', (self, keyval, modifiers) => {
            row.remove_conflict(keyval, modifiers);
        });

        this.connect('realize', () => {
            const accelerator_set_handler = row.connect('accelerator-set', () => {
                GObject.signal_handler_block(this, conflict_handler);

                try {
                    for (const accel of row.value) {
                        let [keyval, modifiers] = accelerator_parse(accel);

                        if (keyval || modifiers)
                            this.emit('accelerator-set', keyval, modifiers);
                    }
                } finally {
                    GObject.signal_handler_unblock(this, conflict_handler);
                }
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                row.disconnect(accelerator_set_handler);
            });
        });

        this.connect('reset', () => {
            this.settings.reset(key);
        });

        this.add(row);

        return row;
    }
}

export class GlobalShortcutGroup extends ShortcutGroup {
    static [GObject.GTypeName] = 'DDTermGlobalShortcutGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Global Shortcuts');

        this.add_shortcut_row({
            key: 'ddterm-toggle-hotkey',
            title: this.gettext('Toggle Terminal Window'),
            global: true,
        });

        this.add_shortcut_row({
            key: 'ddterm-activate-hotkey',
            title: this.gettext('Show/Activate Terminal Window'),
            global: true,
        });
    }
}

export class ApplicationShortcutGroup extends ShortcutGroup {
    static [GObject.GTypeName] = 'DDTermApplicationShortcutGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Application Shortcuts');

        this.add_switch_row({
            key: 'shortcuts-enabled',
            title: this.gettext('_Enable application shortcuts'),
        });

        this.add_shortcut_row({
            key: 'shortcut-window-hide',
            title: this.gettext('Hide the Window'),
        });

        this.add_shortcut_row({
            key: 'shortcut-toggle-maximize',
            title: this.gettext('Maximize/Unmaximize the Window'),
        });

        this.add_shortcut_row({
            key: 'shortcut-window-size-inc',
            title: this.gettext('Increase Window Size'),
        });

        this.add_shortcut_row({
            key: 'shortcut-window-size-dec',
            title: this.gettext('Decrease Window Size'),
        });

        this.add_shortcut_row({
            key: 'shortcut-background-opacity-inc',
            title: this.gettext('Increase Background Opacity'),
        });

        this.add_shortcut_row({
            key: 'shortcut-background-opacity-dec',
            title: this.gettext('Decrease Background Opacity'),
        });

        this.add_shortcut_row({
            key: 'shortcut-toggle-transparent-background',
            title: this.gettext('Enable/Disable Background Transparency'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-copy',
            title: this.gettext('Copy Selected Text'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-copy-html',
            title: this.gettext('Copy Selected Text as HTML'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-paste',
            title: this.gettext('Paste Text from Clipboard'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-select-all',
            title: this.gettext('Select All'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-reset',
            title: this.gettext('Reset'),
        });

        this.add_shortcut_row({
            key: 'shortcut-terminal-reset-and-clear',
            title: this.gettext('Reset and Clear'),
        });

        this.add_shortcut_row({
            key: 'shortcut-win-new-tab',
            title: this.gettext('New Tab After Last Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-win-new-tab-front',
            title: this.gettext('New Tab Before First Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-win-new-tab-before-current',
            title: this.gettext('New Tab Before Current Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-win-new-tab-after-current',
            title: this.gettext('New Tab After Current Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-page-close',
            title: this.gettext('Close Current Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-prev-tab',
            title: this.gettext('Switch to Previous Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-next-tab',
            title: this.gettext('Switch to Next Tab'),
        });

        this.add_shortcut_row({
            key: 'shortcut-move-tab-prev',
            title: this.gettext('Move Tab to Previous Position'),
        });

        this.add_shortcut_row({
            key: 'shortcut-move-tab-next',
            title: this.gettext('Move Tab to Next Position'),
        });

        this.add_shortcut_row({
            key: 'shortcut-split-horizontal',
            title: this.gettext('Split Horizontally'),
        });

        this.add_shortcut_row({
            key: 'shortcut-split-vertical',
            title: this.gettext('Split Vertically'),
        });

        this.add_shortcut_row({
            key: 'shortcut-focus-other-pane',
            title: this.gettext('Move Keyboard Focus to Other Split Pane'),
        });

        this.add_shortcut_row({
            key: 'shortcut-move-tab-to-other-pane',
            title: this.gettext('Move Tab to Other Split Pane'),
        });

        this.add_shortcut_row({
            key: 'shortcut-split-position-inc',
            title: this.gettext('Increase First Split Pane Size'),
        });

        this.add_shortcut_row({
            key: 'shortcut-split-position-dec',
            title: this.gettext('Decrease First Split Pane Size'),
        });

        this.add_shortcut_row({
            key: 'shortcut-set-custom-tab-title',
            title: this.gettext('Set Custom Tab Title'),
        });

        this.add_shortcut_row({
            key: 'shortcut-reset-tab-title',
            title: this.gettext('Reset Tab Title'),
        });

        this.add_shortcut_row({
            key: 'shortcut-find',
            title: this.gettext('Find'),
        });

        this.add_shortcut_row({
            key: 'shortcut-find-next',
            title: this.gettext('Find Next'),
        });

        this.add_shortcut_row({
            key: 'shortcut-find-prev',
            title: this.gettext('Find Previous'),
        });

        this.add_shortcut_row({
            key: 'shortcut-font-scale-increase',
            title: this.gettext('Zoom In'),
        });

        this.add_shortcut_row({
            key: 'shortcut-font-scale-decrease',
            title: this.gettext('Zoom Out'),
        });

        this.add_shortcut_row({
            key: 'shortcut-font-scale-reset',
            title: this.gettext('Normal Size'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-1',
            title: this.gettext('Switch to Tab 1'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-2',
            title: this.gettext('Switch to Tab 2'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-3',
            title: this.gettext('Switch to Tab 3'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-4',
            title: this.gettext('Switch to Tab 4'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-5',
            title: this.gettext('Switch to Tab 5'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-6',
            title: this.gettext('Switch to Tab 6'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-7',
            title: this.gettext('Switch to Tab 7'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-8',
            title: this.gettext('Switch to Tab 8'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-9',
            title: this.gettext('Switch to Tab 9'),
        });

        this.add_shortcut_row({
            key: 'shortcut-switch-to-tab-10',
            title: this.gettext('Switch to Tab 10'),
        });
    }

    add_shortcut_row({ key, flags = Gio.SettingsBindFlags.DEFAULT, ...params }) {
        const row = super.add_shortcut_row({
            key,
            flags: flags | Gio.SettingsBindFlags.NO_SENSITIVITY,
            ...params,
        });

        if (!(flags & Gio.SettingsBindFlags.NO_SENSITIVITY))
            this.connect('realize', this.#setup_row_sensitivity.bind(this, key, row));

        return row;
    }

    #setup_row_sensitivity(key, row) {
        const update = this.#update_row_sensitivity.bind(this, key, row);

        const handlers = [
            this.settings.connect('changed::shortcuts-enabled', update),
            this.settings.connect(`writable-changed::${key}`, update),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of handlers)
                this.settings.disconnect(handler);
        });

        update();
    }

    #update_row_sensitivity(key, row) {
        row.sensitive =
            this.settings.is_writable(key) && this.settings.get_boolean('shortcuts-enabled');
    }
}

export class ResetShortcutsGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermResetShortcutsGroup';

    static [GObject.signals] = {
        'reset': {},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        const reset_button = new Gtk.Button({
            visible: true,
            label: this.gettext('Reset All Shortcuts to Defaults'),
        });

        reset_button.get_style_context().add_class('destructive-action');

        this.connect('realize', () => {
            const reset_handler = reset_button.connect('clicked', () => {
                this.emit('reset');
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                reset_button.disconnect(reset_handler);
            });
        });

        this.add(reset_button);
    }
}
