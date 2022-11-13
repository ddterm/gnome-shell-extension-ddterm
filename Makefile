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
GENERATED :=
TRANSLATABLE_SOURCES :=

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
LOCALE_COMPILED_PATTERN := locale/%/LC_MESSAGES/$(EXTENSION_UUID).mo
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

rxjs.js: node_modules/rxjs/dist/bundles/rxjs.umd.js
	cp $< $@

GENERATED += handlebars.js rxjs.js
CLEAN += handlebars.js rxjs.js

# Gtk 3 .ui

GLADE_UI := $(wildcard glade/*.ui)
UI_SRC_PATTERN := glade/%.ui
TRANSLATABLE_SOURCES += $(GLADE_UI)

GTK_MULTI_VERSION_UI := $(wildcard glade/prefs-*.ui)

GTK3_ONLY_UI_SRC := $(filter-out $(GTK_MULTI_VERSION_UI),$(GLADE_UI))
GTK3_ONLY_UI_DST_PATTERN := %.ui
GTK3_ONLY_UI_DST := $(patsubst $(UI_SRC_PATTERN),$(GTK3_ONLY_UI_DST_PATTERN),$(GTK3_ONLY_UI_SRC))

$(GTK3_ONLY_UI_DST): $(GTK3_ONLY_UI_DST_PATTERN): $(UI_SRC_PATTERN)
	gtk-builder-tool simplify $< >$@

GTK3_MULTI_VERSION_UI_PATTERN := %-gtk3.ui
GTK3_MULTI_VERSION_UI := $(patsubst $(UI_SRC_PATTERN),$(GTK3_MULTI_VERSION_UI_PATTERN),$(GTK_MULTI_VERSION_UI))

$(GTK3_MULTI_VERSION_UI): $(GTK3_MULTI_VERSION_UI_PATTERN): $(UI_SRC_PATTERN)
	gtk-builder-tool simplify $< >$@

GTK3_UI := $(GTK3_ONLY_UI_DST) $(GTK3_MULTI_VERSION_UI)

GENERATED += $(GTK3_UI)
CLEAN += $(GTK3_UI)

# Gtk 4 .ui

tmp:
	mkdir -p tmp

GTK_3TO4_FIXUP_UI_PATTERN := tmp/%-3to4-fixup.ui
GTK_3TO4_FIXUP_UI := $(patsubst $(UI_SRC_PATTERN),$(GTK_3TO4_FIXUP_UI_PATTERN),$(GTK_MULTI_VERSION_UI))

$(GTK_3TO4_FIXUP_UI): $(GTK_3TO4_FIXUP_UI_PATTERN): $(UI_SRC_PATTERN) glade/3to4-fixup.xsl | tmp
	xsltproc glade/3to4-fixup.xsl $< >$@

GTK_3TO4_UI_PATTERN := tmp/%-3to4.ui
GTK_3TO4_UI := $(patsubst $(GTK_3TO4_FIXUP_UI_PATTERN),$(GTK_3TO4_UI_PATTERN),$(GTK_3TO4_FIXUP_UI))

$(GTK_3TO4_UI): $(GTK_3TO4_UI_PATTERN): $(GTK_3TO4_FIXUP_UI_PATTERN) | tmp
	gtk4-builder-tool simplify --3to4 $< >$@

GTK4_UI_PATTERN := %-gtk4.ui
GTK4_UI := $(patsubst $(GTK_3TO4_UI_PATTERN),$(GTK4_UI_PATTERN),$(GTK_3TO4_UI))

$(GTK4_UI): $(GTK4_UI_PATTERN): $(GTK_3TO4_UI_PATTERN)
	gtk4-builder-tool simplify $< >$@

CLEAN += $(GTK_3TO4_UI) $(GTK_3TO4_FIXUP_UI) $(GTK4_UI)

ifeq ($(call is-true,$(WITH_GTK4)),1)
GENERATED += $(GTK4_UI)
endif

# metadata.json

# Prevent people from trying to feed source archives to 'gnome-extensions install'.
# https://github.com/ddterm/gnome-shell-extension-ddterm/issues/61

metadata.json: metadata.json.in
	cp $< $@

GENERATED += metadata.json
CLEAN += metadata.json

# package

JS_SOURCES := $(filter-out $(GENERATED), $(wildcard *.js))
GTK3_HANDCRAFTED_UI := menus.ui
TRANSLATABLE_SOURCES += $(JS_SOURCES) $(GTK3_HANDCRAFTED_UI)
EXECUTABLES := com.github.amezin.ddterm

PACK_CONTENT := \
	$(JS_SOURCES) \
	style.css \
	$(GENERATED) \
	$(GTK3_HANDCRAFTED_UI) \
	LICENSE \
	$(EXECUTABLES) \
	com.github.amezin.ddterm.Extension.xml \
	$(LOCALES_COMPILED) \
	$(SCHEMAS) \
	$(SCHEMAS_COMPILED)

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
SYS_INSTALLED_DIRS := $(sort $(dir $(SYS_INSTALLED_CONTENT)))
SYS_INSTALLED_EXECUTABLES := $(addprefix $(SYS_INSTALLED_FULL_PREFIX)/,$(EXECUTABLES))

$(SYS_INSTALLED_DIRS):
	mkdir -p $@

installdirs: $(SYS_INSTALLED_DIRS)

$(SYS_INSTALLED_CONTENT): $(SYS_INSTALLED_FULL_PREFIX)/%: % | installdirs
	$(INSTALL) $< $@

$(SYS_INSTALLED_CONTENT): INSTALL := $(INSTALL_DATA)
$(SYS_INSTALLED_EXECUTABLES): INSTALL := $(INSTALL_PROGRAM)

system-install: $(SYS_INSTALLED_CONTENT)

system-uninstall:
	$(RM) -r $(SYS_INSTALLED_FULL_PREFIX)

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

GTK3_VALIDATE_UI := $(addprefix gtk-builder-validate/,$(filter-out terminalpage.ui,$(GTK3_UI)) $(GTK3_HANDCRAFTED_UI))

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

POT_FILE := tmp/$(EXTENSION_UUID).pot

$(POT_FILE): $(sort $(TRANSLATABLE_SOURCES)) | tmp
	xgettext \
		--from-code=UTF-8 \
		--default-domain=$(EXTENSION_UUID) \
		--package-name=ddterm \
		--output=$@ \
		$^

CLEAN += $(POT_FILE)

MSGCMP_GOALS := $(addprefix msgcmp/, $(LOCALES))

$(MSGCMP_GOALS): msgcmp/%: % $(POT_FILE)
	msgcmp $(MSGCMP_FLAGS) $^

msgcmp: MSGCMP_FLAGS := --use-untranslated
msgcmp: $(MSGCMP_GOALS)

msgcmp-strict: MSGCMP_FLAGS :=
msgcmp-strict: $(MSGCMP_GOALS)

.PHONY: msgcmp msgcmp-strict $(MSGCMP_GOALS)
all: msgcmp

MSGMERGE_GOALS := $(addprefix msgmerge/, $(LOCALES))

$(MSGMERGE_GOALS): msgmerge/%: % $(POT_FILE)
	msgmerge -U $^

msgmerge: $(MSGMERGE_GOALS)

.PHONY: msgmerge $(MSGMERGE_GOALS)

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

toggle quit begin-subscription-leak-check end-subscription-leak-check:
	gapplication action com.github.amezin.ddterm $@

.PHONY: toggle quit begin-subscription-leak-check end-subscription-leak-check
