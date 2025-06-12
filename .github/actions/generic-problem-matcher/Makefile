#!/usr/bin/env -S make -f

# SPDX-FileCopyrightText: 2025 Aleksandr Mezin
# SPDX-License-Identifier: CC0-1.0

GO_JSONNET_VER := v0.21.0
GO_JSONNET_DIST_NAME := go-jsonnet_$(shell uname -s)_$(shell uname -m).tar.gz
GO_JSONNET_DIST_URL := https://github.com/google/go-jsonnet/releases/download/$(GO_JSONNET_VER)/$(GO_JSONNET_DIST_NAME)

all: generic.json

clean:
	$(RM) -r go-jsonnet

.PHONY: all clean

go-jsonnet:
	mkdir $@

go-jsonnet/$(GO_JSONNET_DIST_NAME): | go-jsonnet
	curl -L -o $@ $(GO_JSONNET_DIST_URL)

go-jsonnet/jsonnet: go-jsonnet/$(GO_JSONNET_DIST_NAME)
	tar xf $< -C $(dir $@)
	touch -c $@

%.json: %.jsonnet go-jsonnet/jsonnet
	go-jsonnet/jsonnet -o $@ $<
