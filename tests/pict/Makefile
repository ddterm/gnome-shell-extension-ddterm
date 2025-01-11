# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

PICT_SOURCE_COMMIT := 7d2ed98c28b837d8337976b7cbf421bd3c4b89dd
PICT_SOURCE_URL := https://github.com/microsoft/pict/archive/$(PICT_SOURCE_COMMIT).tar.gz
PICT_SOURCE_TARBALL := build/$(PICT_SOURCE_COMMIT).tar.gz
PICT_BUILD_DIR := build/pict-$(PICT_SOURCE_COMMIT)
PICT_EXECUTABLE := $(PICT_BUILD_DIR)/pict

ALL := $(patsubst %.model,%.gen,$(wildcard *.model))

all: $(ALL)

clean:
	$(RM) $(ALL) $(PICT_SOURCE_TARBALL)
	$(RM) -r $(PICT_BUILD_DIR)

$(ALL): %.gen: %.model $(PICT_EXECUTABLE) Makefile
	$(PICT_EXECUTABLE) $< >$@ $(PICT_FLAGS)

test_show.gen: PICT_FLAGS := /o:3

$(sort $(dir $(PICT_SOURCE_TARBALL) $(PICT_BUILD_DIR))):
	mkdir $@

$(PICT_SOURCE_TARBALL): | $(dir $(PICT_SOURCE_TARBALL))
	curl -L -o $@ $(PICT_SOURCE_URL)

$(PICT_BUILD_DIR)/Makefile: $(PICT_SOURCE_TARBALL) | $(dir $(PICT_BUILD_DIR))
	tar -x -m -f $(abspath $<) -C $(firstword $|)

$(PICT_EXECUTABLE): $(PICT_BUILD_DIR)/Makefile
	$(MAKE) -C $(dir $<) $(notdir $@)

$(PICT_EXECUTABLE): $(wildcard $(addprefix $(PICT_BUILD_DIR)/api/,*.c *.cpp *.h))
$(PICT_EXECUTABLE): $(wildcard $(addprefix $(PICT_BUILD_DIR)/cli/,*.c *.cpp *.h))

.PHONY: all clean
