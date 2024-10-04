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
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { Notification, NotificationSource } from './compat.js';
import { find_package_installer } from './packagemanager.js';

const DetailsDialog = GObject.registerClass({
    Signals: {
        'copy-to-clipboard': {},
    },
}, class DDTermNotificationDetailsDialog extends ModalDialog.ModalDialog {
    _init(markup, gettext_context) {
        super._init();

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
            label: gettext_context.gettext('Copy to Clipboard'),
            action: () => this.emit('copy-to-clipboard'),
        });

        this.addButton({
            label: gettext_context.gettext('Close'),
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
});

const VersionMismatchNotification = GObject.registerClass({
}, class DDTermVersionMismatchNotification extends Notification {
    static create(source, gettext_context) {
        const title = gettext_context.gettext('Warning: ddterm version has changed');
        const help =
            gettext_context.gettext('Log out, then log in again to load the updated extension.');

        return new VersionMismatchNotification(source, title, help);
    }
});

const ErrorNotification = GObject.registerClass({
}, class DDTermErrorNotification extends Notification {
    static create(source, message, details, gettext_context) {
        if (message instanceof Error || message instanceof GLib.Error)
            message = message.message;

        if (details instanceof Error || details instanceof GLib.Error)
            details = details.message;

        message = `${message}`;
        details = `${details ?? ''}`;

        const notification = new ErrorNotification(source, message, details);
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

                const dialog = new DetailsDialog(markup, gettext_context);

                dialog.connect('copy-to-clipboard', copy_to_clipboard);
                dialog.open(global.get_current_time(), true);
            };

            notification.addAction(gettext_context.gettext('Details…'), show_details);
            notification.connect('activated', show_details);
        }

        notification.addAction(gettext_context.gettext('Copy to Clipboard'), copy_to_clipboard);

        return notification;
    }
});

const MissingDependenciesNotification = GObject.registerClass({
}, class DDTermMissingDependenciesNotification extends Notification {
    static create(source, packages, files, gettext_context) {
        const title = gettext_context.gettext('ddterm needs additional packages to run');
        const lines = [];

        if (packages.length > 0) {
            lines.push(
                gettext_context.gettext('Please install the following packages:'),
                packages.join(' ')
            );
        }

        if (files.length > 0) {
            lines.push(
                gettext_context.gettext(
                    'Please install packages that provide the following files:'
                ),
                files.join(' ')
            );
        }

        const notification =
            new MissingDependenciesNotification(source, title, lines.join('\n'));

        if (packages.length === 0)
            return notification;

        const cancellable = new Gio.Cancellable();

        notification.connect('destroy', () => {
            cancellable.cancel();
        });

        find_package_installer(cancellable).then(installer => {
            if (!installer)
                return;

            notification.addAction(gettext_context.gettext('Install'), () => {
                installer(packages);
            });

            notification.update?.(notification.title, notification.bannerBodyText, {});
        });

        return notification;
    }
});

export const Notifications = GObject.registerClass({
    Properties: {
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class DDTermNotifications extends GObject.Object {
    _init(params) {
        super._init(params);

        if (!this.gettext_context)
            throw new Error(`gettext-context is ${this.gettext_context}`);

        this._source = null;
    }

    create_source() {
        if (this._source)
            return this._source;

        this._source =
            new NotificationSource(this.gettext_context.gettext('ddterm'), 'utilities-terminal');

        this._source.connect('destroy', () => {
            this._source = null;
        });

        Main.messageTray.add(this._source);
        return this._source;
    }

    show_version_mismatch() {
        const source = this.create_source();
        const notification = VersionMismatchNotification.create(source, this.gettext_context);

        source.showNotification(notification);
    }

    show_error(message, trace) {
        const source = this.create_source();

        if (source.notifications.some(n => n instanceof MissingDependenciesNotification))
            return;

        const notification = ErrorNotification.create(
            source,
            message,
            trace,
            this.gettext_context
        );

        source.notifications.filter(n => n instanceof VersionMismatchNotification).forEach(n => {
            n.setUrgency(MessageTray.Urgency.CRITICAL);
        });

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        source.showNotification(notification);
    }

    show_missing_dependencies(packages, files) {
        const source = this.create_source();
        const notification = MissingDependenciesNotification.create(
            source,
            packages,
            files,
            this.gettext_context
        );

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        notification.setForFeedback(true);
        source.showNotification(notification);
    }

    destroy(reason = MessageTray.NotificationDestroyedReason.SOURCE_CLOSED) {
        this._source?.destroy(reason);
    }
});
