import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {
    connect,
    connect_after,
    get_main,
    get_resource_dbus_interface_info,
    dbus_auto_pspecs,
} from './util.js';

const DBUS_INTERFACE_INFO =
    get_resource_dbus_interface_info('./dbus-interfaces/com.github.amezin.ddterm.TestHook.xml');

let Main;

const Interface = GObject.registerClass({
    Properties: {
        ...dbus_auto_pspecs(DBUS_INTERFACE_INFO),
    },
    Signals: {
        'MoveResizeRequested': {
            param_types: [GLib.Variant],
        },
    },
}, class DDTermTestHookInterface extends GObject.Object {
    _init(state_obj) {
        super._init();

        this._destroy_callbacks = [];

        if (GObject.signal_lookup('shutdown', Shell.Global)) {
            this._destroy_callbacks.push(
                connect(global, 'shutdown', () => this.Destroy())
            );
        }

        this.state_obj = state_obj;
        this.enabled_state = state_obj.enabled_state;
        this.service = this.enabled_state.service;
        this.window_matcher = this.enabled_state.window_matcher;

        this.window = null;
        this._window_disconnect = [];
        this._actor_disconnect = [];

        this._destroy_callbacks.push(() => this._disconnect_window());
        this._destroy_callbacks.push(() => this._disconnect_actor());

        this._destroy_callbacks.push(
            connect(this.window_matcher, 'notify::current-window', () => {
                this._connect_window();
            })
        );

        const update_transitions = (_, actor) => {
            if (actor === this._actor)
                this._update_transitions();
        };

        [
            'destroy',
            'kill-window-effects',
            'minimize',
            'size-change',
            'size-changed',
            'unminimize',
        ].map(
            signal => connect_after(global.window_manager, signal, update_transitions)
        ).forEach(disconnect => this._destroy_callbacks.push(disconnect));

        this._destroy_callbacks.push(
            connect_after(global.window_manager, 'map', (wm, actor) => {
                if (Main.wm._waitForOverviewToHide)
                    Main.wm._waitForOverviewToHide().then(() => update_transitions(wm, actor));
                else
                    update_transitions(wm, actor);
            })
        );

        this._destroy_callbacks.push(
            connect(global.stage, 'before-update', () => {
                this._update_transitions();
            })
        );

        this._connect_window();
        this._update_window_rect();
        this._update_transitions();

        this.service.bind_property(
            'is-running',
            this,
            'AppRunning',
            GObject.BindingFlags.DEFAULT
        );

        this.wrapper = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE_INFO, this);

        this.connect('MoveResizeRequested', (_, rect) => {
            this.wrapper.emit_signal('MoveResizeRequested', rect);
        });

        for (const property_info of this.wrapper.get_info().properties) {
            const { name, signature } = property_info;

            this.connect(`notify::${name}`, () => {
                let value = this[name];

                if (!(value instanceof GLib.Variant) || value.get_type_string() !== signature)
                    value = new GLib.Variant(signature, value);

                this.wrapper.emit_property_changed(name, value);
            });

            this.notify(name);
        }

        this.wrapper.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm/TestHook');
        this._destroy_callbacks.push(() => this.wrapper.unexport());

        this.connect('notify', () => this.wrapper.flush());
        this.wrapper.flush();
    }

    _disconnect_window() {
        while (this._window_disconnect.length)
            this._window_disconnect.pop()();

        this.window = null;
    }

    _disconnect_actor() {
        while (this._actor_disconnect.length)
            this._actor_disconnect.pop()();

        this._actor = null;
    }

    _connect_window() {
        const win = this.window_matcher.current_window;

        if (win === this.window)
            return;

        this.freeze_notify();

        try {
            this._disconnect_window();

            if (!win) {
                this._update_transitions();
                this.HasWindow = false;
                this.MaximizedHorizontally = false;
                this.MaximizedVertically = false;
                this.ClientType = '';
                this._update_window_rect();

                return;
            }

            this._disconnect_actor();

            this.window = win;

            [
                win.bind_property(
                    'maximized-horizontally',
                    this,
                    'MaximizedHorizontally',
                    GObject.BindingFlags.SYNC_CREATE
                ),
                win.bind_property(
                    'maximized-vertically',
                    this,
                    'MaximizedVertically',
                    GObject.BindingFlags.SYNC_CREATE
                ),
                win.bind_property(
                    'above',
                    this,
                    'WindowAbove',
                    GObject.BindingFlags.SYNC_CREATE
                ),
                win.bind_property(
                    'skip-taskbar',
                    this,
                    'WindowSkipTaskbar',
                    GObject.BindingFlags.SYNC_CREATE
                ),
                win.bind_property(
                    'on-all-workspaces',
                    this,
                    'WindowOnAllWorkspaces',
                    GObject.BindingFlags.SYNC_CREATE
                ),
            ].forEach(binding => {
                this._window_disconnect.push(() => binding.unbind());
            });

            this._window_disconnect.push(
                connect(win, 'position-changed', () => {
                    this._update_window_rect();
                }),
                connect(win, 'size-changed', () => {
                    this._update_window_rect();
                }),
                connect(win, 'unmanaged', () => {
                    if (this.window === win)
                        this._disconnect_window();
                })
            );

            this._actor = win.get_compositor_private();

            this._actor_disconnect.push(
                () => {
                    this._update_transitions();
                    this.RenderedFirstFrame = false;
                },
                connect(this._actor, 'transition-stopped', () => {
                    this._update_transitions();
                }),
                connect(this._actor, 'transitions-completed', () => {
                    this._update_transitions();
                }),
                connect(this._actor, 'destroy', () => {
                    this._disconnect_actor();
                }),
                connect(this._actor, 'first-frame', () => {
                    if (this._actor.visible) {
                        this.RenderedFirstFrame = true;
                        return;
                    }

                    const after_paint_visible_disconnect =
                        connect(global.stage, 'after-paint', (_, view) => {
                            if (!this._actor.visible)
                                return;

                            if (!this._actor.peek_stage_views().includes(view))
                                return;

                            after_paint_visible_disconnect();

                            this._actor_disconnect.splice(
                                this._actor_disconnect.indexOf(after_paint_visible_disconnect),
                                1
                            );

                            this.RenderedFirstFrame = true;
                        });

                    this._actor_disconnect.push(after_paint_visible_disconnect);
                })
            );

            this._update_window_rect();
            this._update_transitions();

            const wm = this.enabled_state.window_manager;
            this._window_disconnect.push(connect(wm, 'move-resize-requested', (_, rect) => {
                this.emit('MoveResizeRequested', GLib.Variant.new_tuple([
                    GLib.Variant.new_int32(rect.x),
                    GLib.Variant.new_int32(rect.y),
                    GLib.Variant.new_int32(rect.width),
                    GLib.Variant.new_int32(rect.height),
                ]));
            }));

            this.ClientType = {
                [Meta.WindowClientType.WAYLAND]: 'wayland',
                [Meta.WindowClientType.X11]: 'x11',
            }[win.get_client_type()];

            this.HasWindow = true;
        } finally {
            this.thaw_notify();
        }
    }

    _update_window_rect() {
        const { x, y, width, height } =
            this.window?.get_frame_rect() ?? { x: 0, y: 0, width: 0, height: 0 };

        const value = [x, y, width, height];

        if (!this.WindowRect?.every((v, i) => v === value[i]))
            this.WindowRect = value;
    }

    _update_transitions() {
        const value = [
            'x',
            'y',
            'width',
            'height',
            'translation-x',
            'translation-y',
            'scale-x',
            'scale-y',
            'opacity',
        ].filter(name => {
            const transition = this._actor?.get_transition(name);

            // Before GNOME 44, disabled animations meant duration=1
            if (!transition || transition.duration <= 1)
                return false;

            const interval = transition?.interval;

            // Exclude dummy transitions
            return interval?.peek_initial_value() !== interval?.peek_final_value();
        });

        if (
            this.Transitions?.length !== value.length ||
            this.Transitions?.some((v, i) => v !== value[i])
        )
            this.Transitions = value;
    }

    Destroy() {
        while (this._destroy_callbacks.length)
            this._destroy_callbacks.pop()();
    }

    get DebugLog() {
        return Boolean(this.state_obj.debug);
    }

    set DebugLog(value) {
        if (Boolean(value) === this.DebugLog)
            return;

        this.state_obj.debug = value ? log : null;
        this.notify('DebugLog');
    }

    get AppExtraArgs() {
        return this.state_obj.app_extra_args;
    }

    set AppExtraArgs(value) {
        const current = this.state_obj.app_extra_args;

        if (current?.length === value?.length && current?.every((v, i) => v === value[i]))
            return;

        this.state_obj.app_extra_args = value;
        this.notify('AppExtraArgs');
    }
});

export async function init() {
    try {
        Main = await get_main();

        new Interface(Main.extensionManager.lookup('ddterm@amezin.github.com').stateObj);
    } catch (ex) {
        logError(ex);
        throw ex;
    }
}
