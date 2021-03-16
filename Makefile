SHELL := /bin/bash

all: schemas/gschemas.compiled lint pack gtk-builder-validate

.PHONY: all

SCHEMAS := $(wildcard schemas/*.gschema.xml)

schemas/gschemas.compiled: $(SCHEMAS)
	glib-compile-schemas --strict $(dir $@)

lint/eslintrc-gjs.yml:
	curl -o $@ 'https://gitlab.gnome.org/GNOME/gjs/-/raw/master/.eslintrc.yml'

lint: lint/eslintrc-gjs.yml
	eslint .

.PHONY: lint

handlebars.js:
	curl -o $@ 'https://cdnjs.cloudflare.com/ajax/libs/handlebars.js/4.7.6/handlebars.min.js'

prefsdialog.ui appwindow.ui terminalpage.ui: %.ui: glade/%.ui
	gtk-builder-tool simplify $< >$@

prefs-gtk3.ui: glade/prefs.ui
	gtk-builder-tool simplify $< >$@

tmp:
	mkdir -p tmp

tmp/prefs-3to4.ui: prefs-gtk3.ui | tmp
	gtk4-builder-tool simplify --3to4 $< >$@

tmp/prefs-3to4-fixup.ui: tmp/prefs-3to4.ui 3to4-fixup.xsl | tmp
	xsltproc 3to4-fixup.xsl $< >$@

prefs-gtk4.ui: tmp/prefs-3to4-fixup.ui
	gtk4-builder-tool simplify $< >$@

GENERATED_SOURCES := prefsdialog.ui appwindow.ui terminalpage.ui prefs-gtk3.ui prefs-gtk4.ui handlebars.js

gtk-builder-validate/%: %
	gtk-builder-tool validate $<

.PHONY: gtk-builder-validate/%

gtk-builder-validate/prefs-gtk4.ui: prefs-gtk4.ui
	gtk4-builder-tool validate $<

.PHONY: gtk-builder-validate/prefs-gtk4.ui

DEFAULT_SOURCES := extension.js prefs.js

EXTRA_SOURCES := $(filter-out test-prefs-gtk4.js,$(wildcard *.js *.ui *.css))
EXTRA_SOURCES += com.github.amezin.ddterm com.github.amezin.ddterm.Extension.xml

EXTRA_SOURCES := $(filter-out $(DEFAULT_SOURCES), $(sort $(GENERATED_SOURCES) $(EXTRA_SOURCES)))

gtk-builder-validate: $(addprefix gtk-builder-validate/, $(filter-out terminalpage.ui,$(filter %.ui,$(EXTRA_SOURCES))))

.PHONY: gtk-builder-validate

EXTENSION_UUID := ddterm@amezin.github.com
DEVELOP_SYMLINK := $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

develop: schemas/gschemas.compiled handlebars.js
	mkdir -p "$(dir $(DEVELOP_SYMLINK))"
	if [[ "$(abspath .)" != "$(abspath $(DEVELOP_SYMLINK))" ]]; then \
		ln -snf "$(abspath .)" "$(DEVELOP_SYMLINK)"; \
	fi

.PHONY: develop

develop-uninstall:
	if [[ -L "$(DEVELOP_SYMLINK)" ]]; then \
		unlink "$(DEVELOP_SYMLINK)"; \
	fi

.PHONY: develop-uninstall

prefs enable disable reset info show:
	gnome-extensions $@ $(EXTENSION_UUID)

.PHONY: prefs enable disable reset info show

EXTENSION_PACK := $(EXTENSION_UUID).shell-extension.zip
$(EXTENSION_PACK): $(SCHEMAS) $(EXTRA_SOURCES) $(DEFAULT_SOURCES) metadata.json
	gnome-extensions pack -f $(addprefix --schema=,$(SCHEMAS)) $(addprefix --extra-source=,$(EXTRA_SOURCES)) .

pack: $(EXTENSION_PACK)
.PHONY: pack

install: $(EXTENSION_PACK) develop-uninstall
	gnome-extensions install -f $<

.PHONY: install

uninstall: develop-uninstall
	gnome-extensions uninstall $(EXTENSION_UUID)

.PHONY: uninstall

toggle quit:
	gapplication action com.github.amezin.ddterm $@

.PHONY: toggle quit

clean:
	$(RM) $(EXTENSION_PACK) $(GENERATED_SOURCES) schemas/gschemas.compiled $(wildcard tmp/*)

.PHONY: clean
