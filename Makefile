#!/usr/bin/env -S make -f

# See docs/BUILD.md

SHELL := /bin/bash

EXTENSION_UUID := ddterm@amezin.github.com

# run 'make WITH_GTK4=no' to disable Gtk 4/GNOME 40 support
# (could be necessary on older distros without gtk4-builder-tool)
WITH_GTK4 := yes

TRUE_VALUES := yes YES true TRUE on ON 1
is-true = $(filter 1,$(words $(filter $(TRUE_VALUES),$(1))))

all:
.PHONY: all

CLEAN :=
TRANSLATABLE_SOURCES :=
PACK_CONTENT :=

# GSettings schemas

SCHEMAS := $(wildcard schemas/*.gschema.xml)
SCHEMAS_COMPILED := schemas/gschemas.compiled

$(SCHEMAS_COMPILED): $(SCHEMAS)
	glib-compile-schemas --strict $(dir $@)

CLEAN += $(SCHEMAS_COMPILED)
PACK_CONTENT += $(SCHEMAS) $(SCHEMAS_COMPILED)

schemas: $(SCHEMAS_COMPILED)
.PHONY: schemas

# Locales

LOCALES := $(wildcard po/*.po)
LOCALE_SOURCE_PATTERN := po/%.po
LOCALE_COMPILED_PATTERN := locale/%/LC_MESSAGES/$(EXTENSION_UUID).mo
LOCALES_COMPILED := $(patsubst $(LOCALE_SOURCE_PATTERN),$(LOCALE_COMPILED_PATTERN),$(LOCALES))

$(LOCALES_COMPILED): $(LOCALE_COMPILED_PATTERN): $(LOCALE_SOURCE_PATTERN)
	mkdir -p $(dir $@)
	msgfmt --check --strict -o $@ $<

CLEAN += $(LOCALES_COMPILED)
PACK_CONTENT += $(LOCALES_COMPILED)

locales: $(LOCALES_COMPILED)
.PHONY: locales

# Bundled libs

HANDLEBARS_DIST := node_modules/handlebars/dist/handlebars.js
RXJS_DIST := node_modules/rxjs/dist/bundles/rxjs.umd.js
NPM_INSTALLED := $(HANDLEBARS_DIST) $(RXJS_DIST)

ddterm/thirdparty:
	mkdir -p $@

ddterm/thirdparty/handlebars.js: $(HANDLEBARS_DIST) | ddterm/thirdparty
ddterm/thirdparty/rxjs.js: $(RXJS_DIST) | ddterm/thirdparty

ddterm/thirdparty/handlebars.js ddterm/thirdparty/rxjs.js:
	cp $< $@

CLEAN += ddterm/thirdparty/handlebars.js ddterm/thirdparty/rxjs.js
PACK_CONTENT += ddterm/thirdparty/handlebars.js ddterm/thirdparty/rxjs.js

# Glade UI

APP_GLADE_UI := $(wildcard ddterm/app/glade/*.ui)
APP_GLADE_UI_PATTERN := ddterm/app/glade/%.ui
PREFS_GLADE_UI := $(wildcard ddterm/pref/glade/*.ui)
PREFS_GLADE_UI_PATTERN := ddterm/pref/glade/%.ui
TRANSLATABLE_SOURCES += $(APP_GLADE_UI) $(PREFS_GLADE_UI)

ddterm/app/ui ddterm/pref/ui:
	mkdir -p $@

# Gtk 3 .ui

ddterm/pref/ui/gtk3: | ddterm/pref/ui
	mkdir -p $@

APP_UI_PATTERN := ddterm/app/ui/%.ui
APP_UI := $(patsubst $(APP_GLADE_UI_PATTERN),$(APP_UI_PATTERN),$(APP_GLADE_UI))

$(APP_UI): $(APP_UI_PATTERN): $(APP_GLADE_UI_PATTERN) | ddterm/app/ui
	gtk-builder-tool simplify $< >$@

PREFS_UI_GTK3_PATTERN := ddterm/pref/ui/gtk3/%.ui
PREFS_UI_GTK3 := $(patsubst $(PREFS_GLADE_UI_PATTERN),$(PREFS_UI_GTK3_PATTERN),$(PREFS_GLADE_UI))

$(PREFS_UI_GTK3): $(PREFS_UI_GTK3_PATTERN): $(PREFS_GLADE_UI_PATTERN) | ddterm/pref/ui/gtk3
	gtk-builder-tool simplify $< >$@

GTK3_GENERATED_UI := $(APP_UI) $(PREFS_UI_GTK3)
GTK3_HANDCRAFTED_UI := ddterm/app/menus.ui
GTK3_UI := $(GTK3_GENERATED_UI) $(GTK3_HANDCRAFTED_UI)

CLEAN += $(GTK3_GENERATED_UI)
PACK_CONTENT += $(GTK3_UI)
TRANSLATABLE_SOURCES += $(GTK3_HANDCRAFTED_UI)

# Gtk 4 .ui

ddterm/pref/ui/gtk4 ddterm/pref/ui/gtk4/3to4-fixup ddterm/pref/ui/gtk4/3to4:
	mkdir -p $@

ddterm/pref/ui/gtk4/3to4-fixup ddterm/pref/ui/gtk4/3to4: | ddterm/pref/ui/gtk4

PREFS_UI_3TO4_FIXUP_PATTERN := ddterm/pref/ui/gtk4/3to4-fixup/%.ui
PREFS_UI_3TO4_FIXUP := $(patsubst $(PREFS_GLADE_UI_PATTERN),$(PREFS_UI_3TO4_FIXUP_PATTERN),$(PREFS_GLADE_UI))

$(PREFS_UI_3TO4_FIXUP): $(PREFS_UI_3TO4_FIXUP_PATTERN): $(PREFS_GLADE_UI_PATTERN) ddterm/pref/glade/3to4-fixup.xsl | ddterm/pref/ui/gtk4/3to4-fixup
	xsltproc ddterm/pref/glade/3to4-fixup.xsl $< >$@

PREFS_UI_3TO4_PATTERN := ddterm/pref/ui/gtk4/3to4/%.ui
PREFS_UI_3TO4 := $(patsubst $(PREFS_UI_3TO4_FIXUP_PATTERN),$(PREFS_UI_3TO4_PATTERN),$(PREFS_UI_3TO4_FIXUP))

$(PREFS_UI_3TO4): $(PREFS_UI_3TO4_PATTERN): $(PREFS_UI_3TO4_FIXUP_PATTERN) | ddterm/pref/ui/gtk4/3to4
	gtk4-builder-tool simplify --3to4 $< >$@

PREFS_UI_GTK4_PATTERN := ddterm/pref/ui/gtk4/%.ui
PREFS_UI_GTK4 := $(patsubst $(PREFS_UI_3TO4_PATTERN),$(PREFS_UI_GTK4_PATTERN),$(PREFS_UI_3TO4))

$(PREFS_UI_GTK4): $(PREFS_UI_GTK4_PATTERN): $(PREFS_UI_3TO4_PATTERN) | ddterm/pref/ui/gtk4
	gtk4-builder-tool simplify $< >$@

CLEAN += $(PREFS_UI_3TO4_FIXUP) $(PREFS_UI_3TO4) $(PREFS_UI_GTK4)

GTK4_UI := $(PREFS_UI_GTK4)

ifeq ($(call is-true,$(WITH_GTK4)),1)
PACK_CONTENT += $(GTK4_UI)
endif

# metadata.json

# Prevent people from trying to feed source archives to 'gnome-extensions install'.
# https://github.com/ddterm/gnome-shell-extension-ddterm/issues/61

metadata.json: metadata.json.in
	cp $< $@

PACK_CONTENT += metadata.json
CLEAN += metadata.json

# JS sources

JS_SOURCE_WILDCARDS := \
	*.js \
	ddterm/*.js \
	ddterm/app/*.js \
	ddterm/app/fakeext/*.js \
	ddterm/rx/*.js \
	ddterm/pref/*.js \
	ddterm/shell/*.js \

JS_SOURCES := $(wildcard $(JS_SOURCE_WILDCARDS))
EXECUTABLES := com.github.amezin.ddterm ddterm/app/dependencies-notification.js

TRANSLATABLE_SOURCES += $(JS_SOURCES)
PACK_CONTENT += $(EXECUTABLES) $(filter-out $(EXECUTABLES),$(JS_SOURCES))

# package

PACK_CONTENT += \
	ddterm/app/style.css \
	ddterm/app/dependencies.json \
	ddterm/com.github.amezin.ddterm.Extension.xml \
	ddterm/com.github.amezin.ddterm.desktop \
	ddterm/com.github.amezin.ddterm.service \
	LICENSE \

PACK_CONTENT := $(sort $(PACK_CONTENT))

build: $(PACK_CONTENT)
.PHONY: build

EXTENSION_PACK := $(EXTENSION_UUID).shell-extension.zip
$(EXTENSION_PACK): $(PACK_CONTENT)
	$(RM) $@
	zip -y -nw $@ -- $^

pack: $(EXTENSION_PACK)
.PHONY: pack

all: pack
CLEAN += $(EXTENSION_PACK)

# install/uninstall package - user

user-install: $(EXTENSION_PACK) develop-uninstall
	gnome-extensions install -f $<

user-uninstall: develop-uninstall
	gnome-extensions uninstall $(EXTENSION_UUID)

.PHONY: user-install user-uninstall

# install/uninstall package - system-wide

# https://www.gnu.org/software/make/manual/html_node/Command-Variables.html
INSTALL := install
INSTALL_PROGRAM := $(INSTALL)
INSTALL_DATA := $(INSTALL) -m 644

# https://www.gnu.org/software/make/manual/html_node/Directory-Variables.html
prefix := /usr
datarootdir := $(prefix)/share
datadir := $(datarootdir)

extensiondir := $(datadir)/gnome-shell/extensions

SYS_INSTALLED_FULL_PREFIX := $(DESTDIR)$(extensiondir)/$(EXTENSION_UUID)
SYS_INSTALLED_CONTENT := $(addprefix $(SYS_INSTALLED_FULL_PREFIX)/,$(PACK_CONTENT))
SYS_INSTALLED_DESKTOP_ENTRY := $(DESTDIR)$(datadir)/applications/com.github.amezin.ddterm.desktop
SYS_INSTALLED_DIRS := $(sort $(dir $(SYS_INSTALLED_CONTENT) $(SYS_INSTALLED_DESKTOP_ENTRY)))
SYS_INSTALLED_EXECUTABLES := $(addprefix $(SYS_INSTALLED_FULL_PREFIX)/,$(EXECUTABLES))

$(SYS_INSTALLED_DIRS):
	mkdir -p $@

installdirs: $(SYS_INSTALLED_DIRS)

$(SYS_INSTALLED_CONTENT): $(SYS_INSTALLED_FULL_PREFIX)/%: % | installdirs
	$(INSTALL) $< $@

$(SYS_INSTALLED_CONTENT): INSTALL := $(INSTALL_DATA)
$(SYS_INSTALLED_EXECUTABLES): INSTALL := $(INSTALL_PROGRAM)

$(SYS_INSTALLED_DESKTOP_ENTRY): ddterm/com.github.amezin.ddterm.desktop | installdirs
	$(INSTALL_DATA) $< $@

system-install: $(SYS_INSTALLED_CONTENT) $(SYS_INSTALLED_DESKTOP_ENTRY)

system-uninstall:
	$(RM) -r $(SYS_INSTALLED_FULL_PREFIX) $(SYS_INSTALLED_DESKTOP_ENTRY)

.PHONY: system-install system-uninstall installdirs

# System/user install autodetect

ifneq ($(DESTDIR),)
INSTALL_FLAVOR := system
else ifeq ($(shell id -u),0)
INSTALL_FLAVOR := system
else
INSTALL_FLAVOR := user
endif

install: $(INSTALL_FLAVOR)-install
uninstall: $(INSTALL_FLAVOR)-uninstall

.PHONY: install uninstall

# develop/symlink install

DEVELOP_SYMLINK := $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

develop: build
	mkdir -p "$(dir $(DEVELOP_SYMLINK))"
	@if [[ -e "$(DEVELOP_SYMLINK)" && ! -L "$(DEVELOP_SYMLINK)" ]]; then \
		echo "$(DEVELOP_SYMLINK) exists and is not a symlink, not overwriting"; exit 1; \
	fi
	if [[ "$(abspath .)" != "$(abspath $(DEVELOP_SYMLINK))" ]]; then \
		ln -snf "$(abspath .)" "$(DEVELOP_SYMLINK)"; \
	fi

develop-uninstall:
	if [[ -L "$(DEVELOP_SYMLINK)" ]]; then \
		unlink "$(DEVELOP_SYMLINK)"; \
	fi

.PHONY: develop develop-uninstall

# clean

clean:
	$(RM) $(CLEAN)

.PHONY: clean

# .ui validation

GTK3_VALIDATE_UI := $(addprefix gtk-builder-validate/,$(filter-out ddterm/app/ui/terminalpage.ui,$(GTK3_UI)))

$(GTK3_VALIDATE_UI): gtk-builder-validate/%: %
	gtk-builder-tool validate $<

.PHONY: $(GTK3_VALIDATE_UI)

GTK4_VALIDATE_UI := $(addprefix gtk-builder-validate/,$(GTK4_UI))

$(GTK4_VALIDATE_UI): gtk-builder-validate/%: %
	gtk4-builder-tool validate $<

.PHONY: $(GTK4_VALIDATE_UI)

gtk-builder-validate: $(GTK3_VALIDATE_UI)

ifeq ($(call is-true,$(WITH_GTK4)),1)
gtk-builder-validate: $(GTK4_VALIDATE_UI)
endif

all: gtk-builder-validate
.PHONY: gtk-builder-validate

# Translation helpers

POT_FILE := po/$(EXTENSION_UUID).pot

$(POT_FILE): $(sort $(TRANSLATABLE_SOURCES))
	xgettext \
		--from-code=UTF-8 \
		--default-domain=$(EXTENSION_UUID) \
		--package-name=ddterm \
		--output=$@ \
		$^

pot: $(POT_FILE)
.PHONY: pot

MSGCMP_GOALS := $(addprefix msgcmp/, $(LOCALES))
MSGCMP_FLAGS := --use-untranslated

$(MSGCMP_GOALS): msgcmp/%: % $(POT_FILE)
	msgcmp $(MSGCMP_FLAGS) $^

msgcmp: $(MSGCMP_GOALS)

msgcmp-strict: MSGCMP_FLAGS :=
msgcmp-strict: $(MSGCMP_GOALS)

.PHONY: msgcmp msgcmp-strict $(MSGCMP_GOALS)

MSGMERGE_GOALS := $(addprefix msgmerge/, $(LOCALES))
MSGMERGE_FLAGS := --no-fuzzy-matching --update

$(MSGMERGE_GOALS): msgmerge/%: % $(POT_FILE)
	msgmerge $(MSGMERGE_FLAGS) $^

msgmerge: $(MSGMERGE_GOALS)

msgmerge-fuzzy: MSGMERGE_FLAGS := --update
msgmerge-fuzzy: $(MSGMERGE_GOALS)

.PHONY: msgmerge $(MSGMERGE_GOALS)

# ESLint

ESLINT_CMD := node_modules/.bin/eslint
ESLINT_OPTS :=
NPM_INSTALLED += $(ESLINT_CMD)

lint/eslintrc-gjs.yml:
	curl -o $@ 'https://gitlab.gnome.org/GNOME/gjs/-/raw/8c50f934bc81f224c6d8f521116ddaa5583eef66/.eslintrc.yml'

lint: $(ESLINT_CMD) lint/eslintrc-gjs.yml
	$< $(ESLINT_OPTS) .

.PHONY: lint
all: lint

# Automagic 'npm install'

NPM_INSTALL := yes

ifeq ($(call is-true,$(NPM_INSTALL)),1)

$(NPM_INSTALLED): node_modules/.package-lock.json

node_modules/.package-lock.json: package.json package-lock.json
	npm install

npm: node_modules/.package-lock.json
.PHONY: npm

endif

# Various helpers

prefs enable disable reset info show:
	gnome-extensions $@ $(EXTENSION_UUID)

.PHONY: prefs enable disable reset info show

toggle quit begin-subscription-leak-check end-subscription-leak-check:
	gapplication action com.github.amezin.ddterm $@

.PHONY: toggle quit begin-subscription-leak-check end-subscription-leak-check
