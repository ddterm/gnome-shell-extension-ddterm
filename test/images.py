#!/usr/bin/env python3

import argparse
import itertools
import json
import subprocess

import yaml

import container_util


def resolve_images(compose_config, services):
    services_config = compose_config['services']

    if services:
        services = [services_config[name] for name in services]
    else:
        services = services_config.values()

    return set(s['image'] for s in services)


def run_prune_resolved(podman, images, dry_run=False):
    image_names = set(i.split(':')[0] for i in images)

    local_images_json = json.loads(podman(
        'image', 'ls', '--format', 'json',
        *(f'-f=reference={i}' for i in image_names),
        stdout=subprocess.PIPE,
    ).stdout)

    for i in itertools.chain.from_iterable(i['Names'] for i in local_images_json):
        if i in images:
            continue

        if dry_run:
            print(i)
        else:
            try:
                podman('image', 'rm', i)
            except subprocess.CalledProcessError as ex:
                print(ex)


def run_prune(compose_config, services, **kwargs):
    run_prune_resolved(
        images=resolve_images(compose_config, services),
        **kwargs
    )


def run_pull(podman, compose_config, services, prune=False):
    images = resolve_images(compose_config, services)

    podman('image', 'pull', *images, timeout=None)

    if prune:
        run_prune_resolved(podman, images)


def run_list(podman, compose_config):
    for service in compose_config['services'].keys():
        print(service)


def run_command(func, file, podman_cmd, **kwargs):
    with open(file) as f:
        compose_config = yaml.safe_load(f)

    func(
        podman=container_util.Podman(podman_cmd),
        compose_config=compose_config,
        **kwargs
    )


def main():
    parser = argparse.ArgumentParser(
        description='Manage container images'
    )

    parser.add_argument(
        '--podman',
        dest='podman_cmd',
        default=['podman'],
        nargs='+',
        help='podman command/executable path'
    )

    parser.add_argument(
        '-f', '--file',
        default='compose.yaml',
        help='configuration file path'
    )

    subparsers = parser.add_subparsers(required=True)

    pull_parser = subparsers.add_parser(
        'pull',
        help='Download/update images'
    )

    pull_parser.add_argument(
        'services',
        nargs='*',
        help='Names of the services (as specified in compose.yaml) to download images for'
    )

    pull_parser.add_argument(
        '--prune',
        action='store_true',
        help='Remove outdated images (i.e. images with the same name but mismatching tag)'
    )

    pull_parser.set_defaults(func=run_pull)

    prune_parser = subparsers.add_parser(
        'prune',
        help='Remove outdated images (i.e. images with the same name but mismatching tag)'
    )

    prune_parser.add_argument(
        'services',
        nargs='*',
        help='Names of the services (as specified in compose.yaml) to prune images for'
    )

    prune_parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Do not delete images, just print their names'
    )

    prune_parser.set_defaults(func=run_prune)

    services_parser = subparsers.add_parser(
        'services',
        help='List available service names'
    )

    services_parser.set_defaults(func=run_list)

    run_command(**vars(parser.parse_args()))


if __name__ == '__main__':
    main()
