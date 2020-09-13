all: schemas/gschemas.compiled lint

.PHONY: all

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas --strict $(dir $@)

lint/eslintrc-gjs.yml:
	curl -o $@ 'https://gitlab.gnome.org/GNOME/gjs/-/raw/master/.eslintrc.yml'

lint: lint/eslintrc-gjs.yml
	eslint .

.PHONY: lint

EXTENSION_UUID := ddterm@amezin.github.com

develop: schemas/gschemas.compiled
	mkdir -p $(HOME)/.local/share/gnome-shell/extensions/
	ln -snf $(abspath .) $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)

.PHONY: develop

prefs enable disable:
	gnome-extensions $@ $(EXTENSION_UUID)
