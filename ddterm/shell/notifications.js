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

import { find_package_installer } from './packagemanager.js';

const DetailsDialog = GObject.registerClass({
    Signals: {
        'copy-to-clipboard': {},
    },
}, class DDTermNotificationDetailsDialog extends ModalDialog.ModalDialog {
    _init(markup, gettext_domain) {
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
});

/*
 * Unfortunately, rebuilding old Notification interface on top of the new interface
 * is easier than building the new one on top of the old one. So will have to use
 * old API for now.
 */
const Notification = MessageTray.Notification.length === 1 ? GObject.registerClass({
}, class DDTermNotification extends MessageTray.Notification {
    constructor(source, title, banner, params) {
        super({ source, title, body: banner, ...params });
    }

    setUrgency(urgency) {
        super.urgency = urgency;
    }

    setForFeedback(value) {
        super.for_feedback = value;
    }
}) : MessageTray.Notification;

const NotificationSource = MessageTray.Source.length !== 1 ? GObject.registerClass({
    'icon': GObject.ParamSpec.object(
        'icon',
        null,
        null,
        GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
        Gio.Icon
    ),
    'icon-name': GObject.ParamSpec.string(
        'icon-name',
        null,
        null,
        GObject.ParamFlags.READWRITE,
        ''
    ),
}, class DDTermNotificationSource extends MessageTray.Source {
    _init({ title, ...params }) {
        super._init(title, null);

        Object.assign(this, params);

        this.connect('notify::icon', this.iconUpdated.bind(this));
    }

    getIcon() {
        return this.icon;
    }

    addNotification(notification) {
        this.showNotification(notification);
    }

    get iconName() {
        if (this.icon instanceof Gio.ThemedIcon)
            return this.icon.icon_name;
        else
            return null;
    }

    set iconName(value) {
        this.icon = value ? new Gio.ThemedIcon({ name: value }) : null;
    }
}) : MessageTray.Source;

const VersionMismatchNotification = GObject.registerClass({
}, class DDTermVersionMismatchNotification extends Notification {
    static create(source, gettext_domain) {
        const title = gettext_domain.gettext('Warning: ddterm version has changed');
        const help =
            gettext_domain.gettext('Log out, then log in again to load the updated extension.');

        return new VersionMismatchNotification(source, title, help);
    }
});

const ErrorNotification = GObject.registerClass({
}, class DDTermErrorNotification extends Notification {
    static create(source, message, details, gettext_domain) {
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
});

const MissingDependenciesNotification = GObject.registerClass({
}, class DDTermMissingDependenciesNotification extends Notification {
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

            notification.addAction(gettext_domain.gettext('Install'), () => {
                installer(packages);
            });

            notification.update?.(notification.title, notification.bannerBodyText, {});
        });

        return notification;
    }
});

export const Notifications = GObject.registerClass({
    Properties: {
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
    },
}, class DDTermNotifications extends GObject.Object {
    _init(params) {
        super._init(params);

        if (!this.gettext_domain)
            throw new Error(`gettext-domain is ${this.gettext_domain}`);

        this._source = null;
    }

    create_source() {
        if (this._source)
            return this._source;

        this._source = new NotificationSource({
            title: this.gettext_domain.gettext('ddterm'),
            icon: this.icon,
        });

        this._source.connect('destroy', () => {
            this._source = null;
        });

        Main.messageTray.add(this._source);
        return this._source;
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
            n.setUrgency(MessageTray.Urgency.CRITICAL);
        });

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
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

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        notification.setForFeedback(true);
        source.addNotification(notification);
    }

    destroy(reason = MessageTray.NotificationDestroyedReason.SOURCE_CLOSED) {
        this._source?.destroy(reason);
    }
});
