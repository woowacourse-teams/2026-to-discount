#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# The administrator supplies a root-owned JSON file, never runner environment values.
python3 - "$@" <<'PYTHON'
import ast
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile


def fail(message):
    raise SystemExit(message)


def trusted_file(path, label):
    for entry in (path, *path.parents):
        mode = entry.lstat()
        if stat.S_ISLNK(mode.st_mode) or mode.st_uid != 0 or mode.st_mode & 0o022:
            fail('Administrator-owned configuration required: ' + label)
    if not path.is_file():
        fail('Configuration must be a regular file: ' + label)


def run(*args):
    # Tool diagnostics can contain server paths; report only the tool name.
    try:
        subprocess.run(args, check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError):
        fail('Provisioning command failed: ' + args[0])


def main():
    if len(sys.argv) != 2:
        fail('Usage: sudo bash provision.sh CONFIG_JSON')
    if os.geteuid() != 0:
        fail('Run provisioning as root')
    config_path = Path(sys.argv[1])
    if not config_path.is_absolute():
        fail('CONFIG_JSON must be absolute')
    trusted_file(config_path, 'CONFIG_JSON')
    config = json.loads(config_path.read_text())
    if not isinstance(config, dict):
        fail('Provisioning configuration must be an object')
    required = ('APP_DIR', 'DATA_DIR', 'RUNNER_DIR', 'UNIT_FILE', 'ENV_FILE',
                'ENV_SOURCE', 'JAVA_BIN', 'DEPLOY_COMMAND', 'SYNC_COMMAND',
                'SUDOERS_FILE', 'USER_SHELL')
    for name in required:
        value = config.get(name)
        # Spaces are supported; reject systemd/sudoers expansion and control syntax.
        if not isinstance(value, str) or not re.fullmatch(r'/[A-Za-z0-9_./ -]+', value):
            fail('Missing or invalid provisioning setting: ' + name)
        if value == '/' or '..' in Path(value).parts or str(Path(value)) != value:
            fail('Invalid provisioning setting: ' + name)
    if len({config[name] for name in required}) != len(required):
        fail('Provisioning settings must use distinct paths')
    if Path(config['UNIT_FILE']).name != 'todiscount-be-dev.service':
        fail('UNIT_FILE must name the development service')
    trusted_file(Path(config['ENV_SOURCE']), 'ENV_SOURCE')
    if Path(config['ENV_FILE']).exists():
        trusted_file(Path(config['ENV_FILE']), 'ENV_FILE')
    if not Path(config['JAVA_BIN']).is_file():
        fail('JAVA_BIN is unavailable')
    if not Path(config['USER_SHELL']).is_file():
        fail('USER_SHELL is unavailable')
    for name in ('UNIT_FILE', 'ENV_FILE', 'DEPLOY_COMMAND', 'SYNC_COMMAND', 'SUDOERS_FILE'):
        parent = Path(config[name]).parent
        for entry in (parent, *parent.parents):
            mode = entry.lstat()
            if stat.S_ISLNK(mode.st_mode) or mode.st_uid != 0 or mode.st_mode & 0o022:
                fail('Unsafe installation directory: ' + name)
        target = Path(config[name])
        if target.is_symlink():
            fail('Installation target must not be a symlink: ' + name)
    # Preserve the fixed contracts in the deployment tools outside this change's scope.
    contracts = {}
    for source, names in (('deploy.py', ('ROOT', 'ARTIFACT_ROOT')),
                          ('sync_offers.py', ('DATA', 'RUNNER'))):
        tree = ast.parse(Path(source).read_text())
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in names:
                        contracts[target.id] = Path(ast.literal_eval(node.value.args[0]))
    expected = {'APP_DIR': contracts.get('ROOT'), 'RUNNER_DIR': contracts.get('RUNNER'),
                'DATA_DIR': contracts['DATA'].parent if 'DATA' in contracts else None}
    if contracts.get('ARTIFACT_ROOT') != expected['RUNNER_DIR']:
        fail('Deployment tools disagree on the runner directory')
    for name, value in expected.items():
        if value is None or Path(config[name]) != value:
            fail('Setting differs from the existing deployment tool contract: ' + name)
    if not (Path(config['DATA_DIR']) / 'export.json').exists() and not Path('export.json').is_file():
        fail('Initial sample export.json is required')
    replacements = {key: config[key] for key in ('DATA_DIR', 'ENV_FILE', 'JAVA_BIN')}
    replacements['JAR_FILE'] = str(Path(config['APP_DIR']) / 'current.jar')
    unit = Path('todiscount-be-dev.service').read_text()
    for key, value in replacements.items():
        unit = unit.replace('@@' + key + '@@', '"' + value + '"')
    if '@@' in unit:
        fail('Unresolved service template setting')
    sudoers = ''.join('todiscount-runner ALL=(root) NOPASSWD: ' +
                      config[key].replace(' ', r'\ ') + '\n'
                      for key in ('DEPLOY_COMMAND', 'SYNC_COMMAND'))
    with tempfile.TemporaryDirectory() as temporary:
        staging = Path(temporary)
        unit_file = staging / 'todiscount-be-dev.service'
        unit_file.write_text(unit)
        sudoers_file = staging / 'runner-sudoers'
        sudoers_file.write_text(sudoers)
        run('systemd-analyze', 'verify', str(unit_file))
        run('visudo', '-cf', str(sudoers_file))
        # All configuration checks precede account creation and installation.
        for user, home in (('todiscount-dev', config['DATA_DIR']),
                           ('todiscount-runner', config['RUNNER_DIR'])):
            exists = subprocess.run(['id', user], capture_output=True).returncode == 0
            if not exists:
                run('useradd', '--system', '--create-home', '--home-dir', home,
                    '--shell', config['USER_SHELL'], user)
        run('install', '-d', '-m', '755', str(Path(config['APP_DIR']) / 'releases'))
        for key, user in (('DATA_DIR', 'todiscount-dev'), ('RUNNER_DIR', 'todiscount-runner')):
            run('install', '-d', '-o', user, '-g', user, '-m', '750', config[key])
        run('install', '-o', 'root', '-g', 'root', '-m', '644', str(unit_file), config['UNIT_FILE'])
        # Preserve an existing service environment when provisioning again.
        if not Path(config['ENV_FILE']).exists():
            run('install', '-o', 'root', '-g', 'todiscount-dev', '-m', '640',
                config['ENV_SOURCE'], config['ENV_FILE'])
        for source, key in (('deploy.py', 'DEPLOY_COMMAND'), ('sync_offers.py', 'SYNC_COMMAND')):
            run('install', '-o', 'root', '-g', 'root', '-m', '755', source, config[key])
        run('install', '-o', 'root', '-g', 'root', '-m', '440', str(sudoers_file), config['SUDOERS_FILE'])
        data = Path(config['DATA_DIR'])
        if not (data / 'export.json').exists():
            run('install', '-o', 'todiscount-dev', '-g', 'todiscount-dev', '-m', '640',
                'export.json', str(data / 'export.json'))
        if not (data / 'banners.yml').exists():
            empty = staging / 'banners.yml'
            empty.write_text('banners: []\n')
            run('install', '-o', 'todiscount-dev', '-g', 'todiscount-dev', '-m', '640',
                str(empty), str(data / 'banners.yml'))
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', 'todiscount-be-dev')
    print('Development provisioning completed')


try:
    main()
except (OSError, ValueError, TypeError):
    fail('Invalid or inaccessible provisioning configuration')
PYTHON
