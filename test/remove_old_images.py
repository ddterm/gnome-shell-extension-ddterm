#!/usr/bin/env python3

import argparse
import itertools
import json
import subprocess

import yaml

import container_util


def run(podman_cmd, dry_run):
    with open('compose.yaml') as f:
        compose_config = yaml.safe_load(f)

    compose_images = set(s['image'] for s in compose_config['services'].values())
    compose_image_names = set(i.split(':')[0] for i in compose_images)

    podman = container_util.Podman(podman_cmd)

    local_images_json = json.loads(podman(
        'image', 'ls', '--format', 'json',
        *(f'-f=reference={i}' for i in compose_image_names),
        stdout=subprocess.PIPE,
    ).stdout)

    for i in itertools.chain.from_iterable(i['Names'] for i in local_images_json):
        if i in compose_images:
            continue

        if dry_run:
            print(i)
        else:
            try:
                podman('image', 'rm', i)
            except subprocess.CalledProcessError as ex:
                print(ex)


def main():
    parser = argparse.ArgumentParser(
        description='Remove images whose names are mentioned in compose.yaml, but tags do not match'
    )

    parser.add_argument(
        '--podman',
        dest='podman_cmd',
        default=['podman'],
        nargs='+',
        help='podman command/executable path'
    )

    parser.add_argument(
        '--dry-run',
        default=False,
        action='store_true',
        help='Do not delete images, just print their names'
    )

    run(**vars(parser.parse_args()))


if __name__ == '__main__':
    main()
