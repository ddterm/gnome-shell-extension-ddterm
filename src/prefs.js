/*
 * Preferences UI implementation
 */

const Adw = imports.gi.Adw;
const Gtk = imports.gi.Gtk;

function buildPrefsWidget() {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 });

    const generalGroup = new Adw.PreferencesGroup({ title: "General" });
    
    const startRow = new Adw.ActionRow({ 
        title: "Launch at Login",
        subtitle: "Automatically start the application when you log in"
    });
    const startSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    startRow.add_suffix(startSwitch);
    generalGroup.add(startRow);

    const themeRow = new Adw.ActionRow({ 
        title: "Appearance",
        subtitle: "Select the preferred color scheme"
    });
    const themeCombo = new Gtk.ComboBoxText();
    themeCombo.append("light", "Light");
    themeCombo.append("dark", "Dark");
    themeRow.add_suffix(themeCombo);
    generalGroup.add(themeRow);

    box.append(generalGroup);
    return box;
}