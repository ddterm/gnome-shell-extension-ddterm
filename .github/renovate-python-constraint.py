#!/usr/bin/env python3

import json
import os
import sys


cur_dir = os.path.dirname(__file__)
src_dir = os.path.dirname(cur_dir)
config_name = 'renovate.json'

with open(os.path.join(src_dir, config_name)) as renovate_config:
    renovate_json = json.load(renovate_config)

renovate_python_ver = renovate_json['constraints']['python']
sys_python_ver = f'{sys.version_info.major}.{sys.version_info.minor}'

if renovate_python_ver != sys_python_ver:
    print(
        '::error::',
        f'Please fix Python version in {config_name}.',
        f'Currently running version: {sys_python_ver!r}.'
    )
    sys.exit(1)
