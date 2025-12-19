// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { findTerminalInstallCommand } from '../util/gjs-typelib-installer.js';

class DetailsDialog extends ModalDialog.ModalDialog {
    static [GObject.GTypeName] = 'DDTermNotificationDetailsDialog';

    static [GObject.signals] = {
        'copy-to-clipboard': {},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(markup, gettext_domain) {
        super();

        const label = new St.Label();
        const viewport = new St.BoxLayout({ vertical: true });
        const scroll_area = new St.ScrollView({
            style_class: 'vfade',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });

        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        label.clutter_text.text = markup;
        label.clutter_text.use_markup = true;

        viewport.add_child(label);

        if (scroll_area.add_actor)
            scroll_area.add_actor(viewport);
        else
            scroll_area.add_child(viewport);

        this.contentLayout.add_child(scroll_area);

        this.addButton({
            label: gettext_domain.gettext('Copy to Clipboard'),
            action: () => this.emit('copy-to-clipboard'),
        });

        this.addButton({
            label: gettext_domain.gettext('Close'),
            action: () => this.close(),
        });
    }

    vfunc_key_release_event(event) {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}

class VersionMismatchNotification extends MessageTray.Notification {
    static [GObject.GTypeName] = 'DDTermVersionMismatchNotification';

    static {
        GObject.registerClass(this);
    }

    static create(source, gettext_domain) {
        const title = gettext_domain.gettext('Warning: ddterm version has changed');
        const body =
            gettext_domain.gettext('Log out, then log in again to load the updated extension.');

        return new VersionMismatchNotification({ source, title, body });
    }
}

class ErrorNotification extends MessageTray.Notification {
    static [GObject.GTypeName] = 'DDTermErrorNotification';

    static {
        GObject.registerClass(this);
    }

    static create(source, message, details, gettext_domain) {
        if (message instanceof Error || message instanceof GLib.Error)
            message = message.message;

        if (details instanceof Error || details instanceof GLib.Error)
            details = details.message;

        message = `${message}`;
        details = `${details ?? ''}`;

        const notification = new ErrorNotification({ source, title: message, body: details });
        const has_details = details.trim() !== '';
        const plaintext = has_details ? [message, '', details].join('\n') : message;
        const copy_to_clipboard = () => {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, plaintext);
        };

        if (has_details) {
            const show_details = () => {
                const markup = [
                    `<b>${GLib.markup_escape_text(message, -1)}</b>`,
                    '',
                    GLib.markup_escape_text(details, -1),
                ].join('\n');

                const dialog = new DetailsDialog(markup, gettext_domain);

                dialog.connect('copy-to-clipboard', copy_to_clipboard);
                dialog.open(global.get_current_time(), true);
            };

            notification.addAction(gettext_domain.gettext('Details…'), show_details);
            notification.connect('activated', show_details);
        }

        notification.addAction(gettext_domain.gettext('Copy to Clipboard'), copy_to_clipboard);

        return notification;
    }
}

class MissingDependenciesNotification extends MessageTray.Notification {
    static [GObject.GTypeName] = 'DDTermMissingDependenciesNotification';

    static {
        GObject.registerClass(this);
    }

    static create(source, packages, files, gettext_domain) {
        const title = gettext_domain.gettext('ddterm needs additional packages to run');
        const lines = [];

        if (packages.length > 0) {
            lines.push(
                gettext_domain.gettext('Please install the following packages:'),
                packages.join(' ')
            );
        }

        if (files.length > 0) {
            lines.push(
                gettext_domain.gettext(
                    'Please install packages that provide the following files:'
                ),
                files.join(' ')
            );
        }

        const notification =
            new MissingDependenciesNotification({ source, title, body: lines.join('\n') });

        if (packages.length === 0)
            return notification;

        const cancellable = new Gio.Cancellable();

        notification.connect('destroy', () => {
            cancellable.cancel();
        });

        findTerminalInstallCommand(cancellable).then(installer => {
            const argv = installer?.(packages);

            if (!argv)
                return;

            notification.addAction(gettext_domain.gettext('Install'), () => {
                const [, pid] = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.DEFAULT, null);

                GLib.spawn_close_pid(pid);
            });

            notification.update?.(notification.title, notification.bannerBodyText, {});
        });

        return notification;
    }
}

export class Notifications extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermNotifications';

    static [GObject.properties] = {
        'icon': GObject.ParamSpec.object(
            'icon',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Icon
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #source;

    constructor(params) {
        super(params);

        if (!this.gettext_domain)
            throw new Error(`gettext-domain is ${this.gettext_domain}`);

        this.#source = null;
    }

    create_source() {
        if (this.#source)
            return this.#source;

        this.#source = new MessageTray.Source({
            title: this.gettext_domain.gettext('ddterm'),
            icon: this.icon,
        });

        this.#source.connect('destroy', () => {
            this.#source = null;
        });

        Main.messageTray.add(this.#source);
        return this.#source;
    }

    show_version_mismatch() {
        const source = this.create_source();
        const notification = VersionMismatchNotification.create(source, this.gettext_domain);

        source.addNotification(notification);
    }

    show_error(message, trace) {
        const source = this.create_source();

        if (source.notifications.some(n => n instanceof MissingDependenciesNotification))
            return;

        const notification = ErrorNotification.create(
            source,
            message,
            trace,
            this.gettext_domain
        );

        source.notifications.filter(n => n instanceof VersionMismatchNotification).forEach(n => {
            n.urgency = MessageTray.Urgency.CRITICAL;
        });

        notification.urgency = MessageTray.Urgency.CRITICAL;
        source.addNotification(notification);
    }

    show_missing_dependencies(packages, files) {
        const source = this.create_source();
        const notification = MissingDependenciesNotification.create(
            source,
            packages,
            files,
            this.gettext_domain
        );

        notification.urgency = MessageTray.Urgency.CRITICAL;
        notification.for_feedback = true;
        source.addNotification(notification);
    }

    destroy(reason = MessageTray.NotificationDestroyedReason.SOURCE_CLOSED) {
        this.#source?.destroy(reason);
    }
}
