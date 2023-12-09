#!/usr/bin/env -S make -f

# See docs/BUILD.md

SHELL := /bin/bash

EXTENSION_UUID := ddterm@amezin.github.com

TRUE_VALUES := yes YES true TRUE on ON 1
is-true = $(filter 1,$(words $(filter $(TRUE_VALUES),$(1))))

all:
.PHONY: all

find-tool = $(or $(shell command -v $(1)),tool-not-found/$(1))

define tool-not-found-message
$* not found and is required.
You could use do-in-docker.sh or do-in-podman.sh to avoid installing build dependencies.
Please check docs/BUILD.md
endef

tool-not-found/%:
	$(error $(tool-not-found-message))

CLEAN :=
TRANSLATABLE_SOURCES :=
PACK_CONTENT :=

# Git revision file

ifeq ($(file <revision.txt.in),$$Format:%H$$)

GIT_TOOL := $(call find-tool,git)

revision.txt: $(GIT_TOOL) .git
	$(GIT_TOOL) rev-parse HEAD >$@

else

revision.txt: revision.txt.in
	cat $< >$@

endif

CLEAN += revision.txt
PACK_CONTENT += revision.txt

# GSettings schemas

SCHEMAS := $(wildcard schemas/*.gschema.xml)
SCHEMAS_COMPILED := schemas/gschemas.compiled

GLIB_COMPILE_SCHEMAS := $(call find-tool,glib-compile-schemas)

$(SCHEMAS_COMPILED): $(SCHEMAS) $(GLIB_COMPILE_SCHEMAS)
	$(GLIB_COMPILE_SCHEMAS) --strict $(dir $@)

CLEAN += $(SCHEMAS_COMPILED)
PACK_CONTENT += $(SCHEMAS)

schemas: $(SCHEMAS_COMPILED)
.PHONY: schemas
all: schemas

# Locales

LINGUAS_FILE := po/LINGUAS
LOCALES_RELEASE := cs de el fr it nb_NO pl pt ru zh_CN
LOCALE_SOURCE_PATTERN := po/%.po
LOCALES_ALL := $(shell grep -Exv '\s*|\s*#.*' $(LINGUAS_FILE))

ONLY_RELEASE_LOCALES := no

ifeq ($(call is-true,$(ONLY_RELEASE_LOCALES)),1)
LOCALES := $(LOCALES_RELEASE)
else
LOCALES := $(LOCALES_ALL)
endif

LOCALE_COMPILED_PATTERN := locale/%/LC_MESSAGES/$(EXTENSION_UUID).mo
LOCALES_COMPILED := $(patsubst %,$(LOCALE_COMPILED_PATTERN),$(LOCALES))

MSGFMT := $(call find-tool,msgfmt)

$(LOCALES_COMPILED): $(LOCALE_COMPILED_PATTERN): $(LOCALE_SOURCE_PATTERN) $(MSGFMT)
	mkdir -p $(dir $@)
	$(MSGFMT) --check --strict --statistics -o $@ $<

$(addprefix msgfmt/,$(LOCALES)): msgfmt/%: $(LOCALE_COMPILED_PATTERN)

CLEAN += $(LOCALES_COMPILED)
PACK_CONTENT += $(LOCALES_COMPILED)

locales msgfmt: $(LOCALES_COMPILED)
.PHONY: locales msgfmt

# Glade UI

PREFS_GLADE_UI := $(wildcard ddterm/pref/glade/*.ui)
PREFS_GLADE_UI_PATTERN := ddterm/pref/glade/%.ui
TRANSLATABLE_SOURCES += $(APP_GLADE_UI) $(PREFS_GLADE_UI)

ddterm/pref/ui:
	mkdir -p $@

# Gtk 3 .ui

GTK_BUILDER_TOOL := $(call find-tool,gtk-builder-tool)

ddterm/pref/ui/gtk3: | ddterm/pref/ui
	mkdir -p $@

PREFS_UI_GTK3_PATTERN := ddterm/pref/ui/gtk3/%.ui
PREFS_UI_GTK3 := $(patsubst $(PREFS_GLADE_UI_PATTERN),$(PREFS_UI_GTK3_PATTERN),$(PREFS_GLADE_UI))

$(PREFS_UI_GTK3): $(PREFS_UI_GTK3_PATTERN): $(PREFS_GLADE_UI_PATTERN) $(GTK_BUILDER_TOOL) | ddterm/pref/ui/gtk3
	$(GTK_BUILDER_TOOL) simplify $< >$@

GTK3_GENERATED_UI := $(APP_UI) $(PREFS_UI_GTK3)
GTK3_HANDCRAFTED_UI := ddterm/app/menus.ui
GTK3_UI := $(GTK3_GENERATED_UI) $(GTK3_HANDCRAFTED_UI)

CLEAN += $(GTK3_GENERATED_UI)
PACK_CONTENT += $(GTK3_UI)
TRANSLATABLE_SOURCES += $(GTK3_HANDCRAFTED_UI)

# Gtk 4 .ui

GTK4_BUILDER_TOOL := $(call find-tool,gtk4-builder-tool)
XSLTPROC := $(call find-tool,xsltproc)

ddterm/pref/ui/gtk4 ddterm/pref/ui/gtk4/3to4-fixup ddterm/pref/ui/gtk4/3to4:
	mkdir -p $@

ddterm/pref/ui/gtk4/3to4-fixup ddterm/pref/ui/gtk4/3to4: | ddterm/pref/ui/gtk4

PREFS_UI_3TO4_FIXUP_PATTERN := ddterm/pref/ui/gtk4/3to4-fixup/%.ui
PREFS_UI_3TO4_FIXUP := $(patsubst $(PREFS_GLADE_UI_PATTERN),$(PREFS_UI_3TO4_FIXUP_PATTERN),$(PREFS_GLADE_UI))

$(PREFS_UI_3TO4_FIXUP): $(PREFS_UI_3TO4_FIXUP_PATTERN): $(PREFS_GLADE_UI_PATTERN) ddterm/pref/glade/3to4-fixup.xsl $(XSLTPROC) | ddterm/pref/ui/gtk4/3to4-fixup
	$(XSLTPROC) ddterm/pref/glade/3to4-fixup.xsl $< >$@

PREFS_UI_3TO4_PATTERN := ddterm/pref/ui/gtk4/3to4/%.ui
PREFS_UI_3TO4 := $(patsubst $(PREFS_UI_3TO4_FIXUP_PATTERN),$(PREFS_UI_3TO4_PATTERN),$(PREFS_UI_3TO4_FIXUP))

$(PREFS_UI_3TO4): $(PREFS_UI_3TO4_PATTERN): $(PREFS_UI_3TO4_FIXUP_PATTERN) $(GTK4_BUILDER_TOOL) | ddterm/pref/ui/gtk4/3to4
	$(GTK4_BUILDER_TOOL) simplify --3to4 $< >$@

PREFS_UI_GTK4_PATTERN := ddterm/pref/ui/gtk4/%.ui
PREFS_UI_GTK4 := $(patsubst $(PREFS_UI_3TO4_PATTERN),$(PREFS_UI_GTK4_PATTERN),$(PREFS_UI_3TO4))

$(PREFS_UI_GTK4): $(PREFS_UI_GTK4_PATTERN): $(PREFS_UI_3TO4_PATTERN) $(GTK4_BUILDER_TOOL) | ddterm/pref/ui/gtk4
	$(GTK4_BUILDER_TOOL) simplify $< >$@

CLEAN += $(PREFS_UI_3TO4_FIXUP) $(PREFS_UI_3TO4) $(PREFS_UI_GTK4)

GTK4_UI := $(PREFS_UI_GTK4)

PACK_CONTENT += $(GTK4_UI)

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
	ddterm/backport/*.js \
	ddterm/pref/*.js \
	ddterm/shell/*.js \
	ddterm/util/*.js \
	misc/*.js \

JS_SOURCES := $(wildcard $(JS_SOURCE_WILDCARDS))
LAUNCHER := bin/com.github.amezin.ddterm
EXECUTABLES := $(LAUNCHER) ddterm/app/dependencies-notification.js

TRANSLATABLE_SOURCES += $(JS_SOURCES)
PACK_CONTENT += $(EXECUTABLES) $(filter-out $(EXECUTABLES),$(JS_SOURCES))

# .desktop entry

UNTRANSLATED_DESKTOP_ENTRY := ddterm/com.github.amezin.ddterm.desktop.in.in
TRANSLATABLE_SOURCES += $(UNTRANSLATED_DESKTOP_ENTRY)

UNCONFIGURED_DESKTOP_ENTRY := $(basename $(UNTRANSLATED_DESKTOP_ENTRY))

$(UNCONFIGURED_DESKTOP_ENTRY): $(UNTRANSLATED_DESKTOP_ENTRY) $(MSGFMT)
	$(MSGFMT) --desktop -o $@ --template=$< -d po

$(UNCONFIGURED_DESKTOP_ENTRY): $(patsubst %,$(LOCALE_SOURCE_PATTERN),$(LOCALES))
$(UNCONFIGURED_DESKTOP_ENTRY): $(LINGUAS_FILE)

$(UNCONFIGURED_DESKTOP_ENTRY): export LINGUAS := $(LOCALES)

CLEAN += $(UNCONFIGURED_DESKTOP_ENTRY)

UNCONFIGURED_DBUS_SERVICE := ddterm/com.github.amezin.ddterm.service.in

# package

PACK_CONTENT += \
	ddterm/app/style.css \
	ddterm/app/dependencies.json \
	$(wildcard ddterm/app/icons/*) \
	ddterm/com.github.amezin.ddterm.Extension.xml \
	ddterm/com.github.amezin.ddterm.HeapDump.xml \
	$(UNCONFIGURED_DESKTOP_ENTRY) \
	$(UNCONFIGURED_DBUS_SERVICE) \
	LICENSE \

PACK_CONTENT := $(sort $(PACK_CONTENT))

build: $(PACK_CONTENT)
.PHONY: build

ZIP := $(call find-tool,zip)

EXTENSION_PACK := $(EXTENSION_UUID).shell-extension.zip
$(EXTENSION_PACK): $(PACK_CONTENT) $(ZIP) $(LINGUAS_FILE)
	$(RM) $@
	$(ZIP) -y -nw $@ -- $(PACK_CONTENT)

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
exec_prefix := $(prefix)
datarootdir := $(prefix)/share
datadir := $(datarootdir)
bindir := $(exec_prefix)/bin

extensiondir := $(datadir)/gnome-shell/extensions

CONFIGURED_DESKTOP_ENTRY := $(basename $(UNCONFIGURED_DESKTOP_ENTRY))
CONFIGURED_DBUS_SERVICE := $(basename $(UNCONFIGURED_DBUS_SERVICE))

SYS_INSTALLED_EXTENSION_DIR := $(extensiondir)/$(EXTENSION_UUID)
SYS_INSTALLED_CONTENT := $(addprefix $(SYS_INSTALLED_EXTENSION_DIR)/,$(PACK_CONTENT) $(SCHEMAS_COMPILED))
SYS_INSTALLED_DESKTOP_ENTRY := $(datadir)/applications/$(notdir $(CONFIGURED_DESKTOP_ENTRY))
SYS_INSTALLED_DBUS_SERVICE := $(datadir)/dbus-1/services/$(notdir $(CONFIGURED_DBUS_SERVICE))
SYS_INSTALLED_EXECUTABLES := $(addprefix $(SYS_INSTALLED_EXTENSION_DIR)/,$(EXECUTABLES))
SYS_INSTALLED_LAUNCHER := $(filter %$(LAUNCHER),$(SYS_INSTALLED_EXECUTABLES))
SYS_INSTALLED_LAUNCHER_SYMLINK := $(bindir)/$(notdir $(LAUNCHER))
SYS_INSTALLED_ALL := \
	$(SYS_INSTALLED_CONTENT) \
	$(SYS_INSTALLED_DESKTOP_ENTRY) \
	$(SYS_INSTALLED_DBUS_SERVICE) \
	$(SYS_INSTALLED_LAUNCHER_SYMLINK) \

SYS_INSTALLED_DIRS := $(sort $(dir $(SYS_INSTALLED_ALL)))

$(addprefix $(DESTDIR),$(SYS_INSTALLED_DIRS)):
	mkdir -p $@

installdirs: $(addprefix $(DESTDIR),$(SYS_INSTALLED_DIRS))

$(addprefix $(DESTDIR),$(SYS_INSTALLED_CONTENT)): $(DESTDIR)$(SYS_INSTALLED_EXTENSION_DIR)/%: % | installdirs
	$(INSTALL) $< $@

$(addprefix $(DESTDIR),$(SYS_INSTALLED_CONTENT)): INSTALL := $(INSTALL_DATA)
$(addprefix $(DESTDIR),$(SYS_INSTALLED_EXECUTABLES)): INSTALL := $(INSTALL_PROGRAM)

$(CONFIGURED_DESKTOP_ENTRY) $(CONFIGURED_DBUS_SERVICE):
	sed -e 's:@LAUNCHER@:$(SYS_INSTALLED_LAUNCHER):g' $< >$@

$(CONFIGURED_DESKTOP_ENTRY): $(UNCONFIGURED_DESKTOP_ENTRY)
$(CONFIGURED_DBUS_SERVICE): $(UNCONFIGURED_DBUS_SERVICE)

CLEAN += $(CONFIGURED_DESKTOP_ENTRY) $(CONFIGURED_DBUS_SERVICE)

$(addprefix $(DESTDIR),$(SYS_INSTALLED_DESKTOP_ENTRY) $(SYS_INSTALLED_DBUS_SERVICE)): | installdirs
	$(INSTALL_DATA) $< $@

$(addprefix $(DESTDIR),$(SYS_INSTALLED_DESKTOP_ENTRY)): $(CONFIGURED_DESKTOP_ENTRY)
$(addprefix $(DESTDIR),$(SYS_INSTALLED_DBUS_SERVICE)): $(CONFIGURED_DBUS_SERVICE)

$(addprefix $(DESTDIR),$(SYS_INSTALLED_LAUNCHER_SYMLINK)): | installdirs
	ln -s $(SYS_INSTALLED_LAUNCHER) $@

system-install: $(addprefix $(DESTDIR),$(SYS_INSTALLED_ALL))

system-uninstall:
	$(RM) $(addprefix $(DESTDIR),$(SYS_INSTALLED_ALL))
	$(RM) -r $(addprefix $(DESTDIR),$(SYS_INSTALLED_FULL_PREFIX))

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

GTK3_VALIDATE_UI := $(addprefix gtk-builder-validate/,$(GTK3_UI))

$(GTK3_VALIDATE_UI): gtk-builder-validate/%: % $(GTK_BUILDER_TOOL)
	$(GTK_BUILDER_TOOL) validate $<

.PHONY: $(GTK3_VALIDATE_UI)

GTK4_VALIDATE_UI := $(addprefix gtk-builder-validate/,$(GTK4_UI))

$(GTK4_VALIDATE_UI): gtk-builder-validate/%: % $(GTK4_BUILDER_TOOL)
	$(GTK4_BUILDER_TOOL) validate $<

.PHONY: $(GTK4_VALIDATE_UI)

gtk-builder-validate: $(GTK3_VALIDATE_UI) $(GTK4_VALIDATE_UI)

all: gtk-builder-validate
.PHONY: gtk-builder-validate

# Translation helpers

POT_FILE := po/$(EXTENSION_UUID).pot
XGETTEXT := $(call find-tool,xgettext)

$(POT_FILE): $(TRANSLATABLE_SOURCES) $(XGETTEXT)
	$(XGETTEXT) \
		--from-code=UTF-8 \
		--default-domain=$(EXTENSION_UUID) \
		--package-name=ddterm \
		--add-comments \
		--output=$@ \
		$(sort $(TRANSLATABLE_SOURCES))

pot: $(POT_FILE)
.PHONY: pot

MSGCMP_GOALS := $(addprefix msgcmp/, $(LOCALES))
MSGCMP_FLAGS := --use-untranslated --use-fuzzy
MSGCMP := $(call find-tool,msgcmp)

$(MSGCMP_GOALS): msgcmp/%: $(LOCALE_SOURCE_PATTERN) $(POT_FILE) $(MSGCMP)
	$(MSGCMP) $(MSGCMP_FLAGS) $< $(POT_FILE)

msgcmp: $(MSGCMP_GOALS)

msgcmp-strict: override MSGCMP_FLAGS :=
msgcmp-strict: $(MSGCMP_GOALS)

.PHONY: msgcmp msgcmp-strict $(MSGCMP_GOALS)

MSGMERGE_GOALS := $(addprefix msgmerge/, $(LOCALES))
MSGMERGE_FLAGS := --no-fuzzy-matching --update
MSGMERGE := $(call find-tool,msgmerge)

$(MSGMERGE_GOALS): msgmerge/%: $(LOCALE_SOURCE_PATTERN) $(POT_FILE) $(MSGMERGE)
	$(MSGMERGE) $(MSGMERGE_FLAGS) $< $(POT_FILE)

msgmerge: $(MSGMERGE_GOALS)

msgmerge-fuzzy: override MSGMERGE_FLAGS := --update --previous
msgmerge-fuzzy: $(MSGMERGE_GOALS)

.PHONY: msgmerge $(MSGMERGE_GOALS)

# ESLint

ESLINT_CMD := node_modules/.bin/eslint
ESLINT_OPTS :=
NPM_INSTALLED += $(ESLINT_CMD)

lint/eslintrc-gjs.yml:
	curl -o $@ 'https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/39ed7f83fd97a5a3f688d77adb73e00fd24b7bfe/lint/eslintrc-gjs.yml'

lint: $(ESLINT_CMD) lint/eslintrc-gjs.yml
	$< $(ESLINT_OPTS) .

.PHONY: lint
all: lint

# Automagic 'npm install'

NPM_INSTALL := yes

ifeq ($(call is-true,$(NPM_INSTALL)),1)

$(NPM_INSTALLED): node_modules/.package-lock.json
NPM := $(call find-tool,npm)

node_modules/.package-lock.json: package.json package-lock.json $(NPM)
	$(NPM) install

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
