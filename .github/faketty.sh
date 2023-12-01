#!/bin/bash

exec script -q -e -c "stty cols 80; $(printf "%q " "$@")"
