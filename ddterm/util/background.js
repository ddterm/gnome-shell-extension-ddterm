// SPDX-FileCopyrightText: 2026 spi
//
// SPDX-License-Identifier: GPL-3.0-or-later

export function migrate_background_effect(settings) {
    const background_effect = settings.get_user_value('background-effect');
    const legacy_transparency = settings.get_user_value('transparent-background');

    if (background_effect === null && legacy_transparency === null)
        return;

    let transparency_enabled, blur_enabled;

    if (background_effect !== null) {
        const effect = background_effect.get_string();
        transparency_enabled = effect === 'transparency';
        blur_enabled = effect === 'blur';
    } else {
        transparency_enabled = legacy_transparency.get_boolean();
        blur_enabled = false;
    }

    if (settings.get_user_value('background-transparency-enabled') === null)
        settings.set_boolean('background-transparency-enabled', transparency_enabled);

    if (settings.get_user_value('background-blur-enabled') === null)
        settings.set_boolean('background-blur-enabled', blur_enabled);

    settings.reset('background-effect');
    settings.reset('transparent-background');
}
