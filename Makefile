#!/usr/bin/env -S make -f

SHELL := /bin/bash

# run 'make WITH_GTK4=no' to disable Gtk 4/GNOME 40 support
# (could be necessary on older distros without gtk4-builder-tool)
WITH_GTK4 := yes

TRUE_VALUES := yes YES true TRUE 1
is-true = $(filter $(TRUE_VALUES),$(1))

all:
.PHONY: all

CLEAN :=
GENERATED_SOURCES :=

# GSettings schemas

SCHEMAS := $(wildcard schemas/*.gschema.xml)
SCHEMAS_COMPILED := schemas/gschemas.compiled

$(SCHEMAS_COMPILED): $(SCHEMAS)
	glib-compile-schemas --strict $(dir $@)

CLEAN += $(SCHEMAS_COMPILED)

schemas: $(SCHEMAS_COMPILED)
.PHONY: schemas

# Locales

LOCALES := $(wildcard po/*.po)
LOCALE_SOURCE_PATTERN := po/%.po
LOCALE_COMPILED_PATTERN := locale/%/LC_MESSAGES/ddterm.mo
LOCALES_COMPILED := $(patsubst $(LOCALE_SOURCE_PATTERN),$(LOCALE_COMPILED_PATTERN),$(LOCALES))

$(LOCALES_COMPILED): $(LOCALE_COMPILED_PATTERN): $(LOCALE_SOURCE_PATTERN)
	mkdir -p $(dir $@)
	msgfmt --check --strict -o $@ $<

CLEAN += $(LOCALES_COMPILED)

locales: $(LOCALES_COMPILED)
.PHONY: locales

# Bundled libs

handlebars.js: node_modules/handlebars/dist/handlebars.js
	cp $< $@

GENERATED_SOURCES += handlebars.js
CLEAN += handlebars.js

# Gtk 3 .ui

GTK3_ONLY_UI := $(filter-out prefs.ui,$(patsubst glade/%,%,$(wildcard glade/*.ui)))

$(GTK3_ONLY_UI): %.ui: glade/%.ui
	gtk-builder-tool simplify $< >$@

prefs-gtk3.ui: glade/prefs.ui
	gtk-builder-tool simplify $< >$@

GENERATED_SOURCES += $(GTK3_ONLY_UI) prefs-gtk3.ui
CLEAN += $(GTK3_ONLY_UI) prefs-gtk3.ui

# Gtk 4 .ui

tmp:
	mkdir -p tmp

tmp/prefs-3to4.ui: prefs-gtk3.ui | tmp
	gtk4-builder-tool simplify --3to4 $< >$@

tmp/prefs-3to4-fixup.ui: glade/3to4-fixup.xsl tmp/prefs-3to4.ui | tmp
	xsltproc $^ >$@

prefs-gtk4.ui: tmp/prefs-3to4-fixup.ui
	gtk4-builder-tool simplify $< >$@

CLEAN += prefs-gtk4.ui tmp/prefs-3to4.ui tmp/prefs-3to4-fixup.ui
GENERATED_SOURCES += $(if $(call is-true,$(WITH_GTK4)), prefs-gtk4.ui)

# metadata.json

# Prevent people from trying to feed source archives to 'gnome-extensions install'.
# https://github.com/amezin/gnome-shell-extension-ddterm/issues/61

metadata.json: metadata.json.in
	cp $< $@

GENERATED_SOURCES += metadata.json
CLEAN += metadata.json

# package

EXTENSION_UUID := ddterm@amezin.github.com

EXTRA_SOURCES := \
	$(wildcard *.js *.css) \
	$(GENERATED_SOURCES) \
	menus.ui \
	LICENSE \
	com.github.amezin.ddterm \
	com.github.amezin.ddterm.Extension.xml

DEFAULT_SOURCES := extension.js prefs.js metadata.json
EXTRA_SOURCES := $(filter-out $(DEFAULT_SOURCES), $(sort $(EXTRA_SOURCES)))

EXTENSION_PACK := $(EXTENSION_UUID).shell-extension.zip
$(EXTENSION_PACK): $(SCHEMAS) $(EXTRA_SOURCES) $(DEFAULT_SOURCES)
	gnome-extensions pack -f $(addprefix --schema=,$(SCHEMAS)) $(addprefix --extra-source=,$(EXTRA_SOURCES)) .

pack: $(EXTENSION_PACK)
.PHONY: pack

all: pack
CLEAN += $(EXTENSION_PACK)

# install/uninstall package

install: $(EXTENSION_PACK) develop-uninstall
	gnome-extensions install -f $<

.PHONY: install

uninstall: develop-uninstall
	gnome-extensions uninstall $(EXTENSION_UUID)

.PHONY: uninstall

# develop/symlink install

DEVELOP_SYMLINK := $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

test-deps: $(SCHEMAS_COMPILED) $(LOCALES_COMPILED) $(GENERATED_SOURCES)

all: test-deps
.PHONY: test-deps

develop: test-deps
	mkdir -p "$(dir $(DEVELOP_SYMLINK))"
	@if [[ -e "$(DEVELOP_SYMLINK)" && ! -L "$(DEVELOP_SYMLINK)" ]]; then \
		echo "$(DEVELOP_SYMLINK) exists and is not a symlink, not overwriting"; exit 1; \
	fi
	if [[ "$(abspath .)" != "$(abspath $(DEVELOP_SYMLINK))" ]]; then \
		ln -snf "$(abspath .)" "$(DEVELOP_SYMLINK)"; \
	fi

.PHONY: develop

develop-uninstall:
	if [[ -L "$(DEVELOP_SYMLINK)" ]]; then \
		unlink "$(DEVELOP_SYMLINK)"; \
	fi

.PHONY: develop-uninstall

# clean

clean:
	$(RM) $(CLEAN)

.PHONY: clean

# .ui validation

gtk-builder-validate/%: %
	gtk-builder-tool validate $<

.PHONY: gtk-builder-validate/%

gtk-builder-validate/prefs-gtk4.ui: prefs-gtk4.ui
	gtk4-builder-tool validate $<

.PHONY: gtk-builder-validate/prefs-gtk4.ui

gtk-builder-validate: $(addprefix gtk-builder-validate/, $(filter-out terminalpage.ui,$(filter %.ui,$(EXTRA_SOURCES))))

all: gtk-builder-validate
.PHONY: gtk-builder-validate

# ESLint

ESLINT_CMD := node_modules/.bin/eslint

lint/eslintrc-gjs.yml:
	curl -o $@ 'https://gitlab.gnome.org/GNOME/gjs/-/raw/8c50f934bc81f224c6d8f521116ddaa5583eef66/.eslintrc.yml'

lint: lint/eslintrc-gjs.yml $(ESLINT_CMD)
	$(ESLINT_CMD) .

.PHONY: lint
all: lint

# Various helpers

prefs enable disable reset info show:
	gnome-extensions $@ $(EXTENSION_UUID)

.PHONY: prefs enable disable reset info show

toggle quit:
	gapplication action com.github.amezin.ddterm $@

.PHONY: toggle quit
