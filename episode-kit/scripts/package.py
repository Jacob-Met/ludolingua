#!/usr/bin/env python3
"""Produce a deterministic ZIP plus sidecar hash after the Node.js bundle check."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import zipfile


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=root.parent / 'ludolingua-episode-kit.zip')
    output = parser.parse_args().output.resolve()
    if output.is_relative_to(root):
        parser.error('Output must be outside episode-kit to avoid recursive packaging')
    sidecar = output.with_name(output.name + '.sha256')
    if output.exists() or sidecar.exists():
        parser.error('Archive and hash sidecar must both be new paths')
    try:
        checked = subprocess.run(
            ['node', 'scripts/build-player-bundle.mjs', '--check'],
            cwd=root, capture_output=True, text=True, check=False,
        )
    except OSError as error:
        parser.error('Cannot check the portable player bundle. Node.js 22 or later must be available: ' + str(error))
    if checked.returncode != 0:
        detail = checked.stderr.strip() or checked.stdout.strip() or ('checker exited with status ' + str(checked.returncode))
        parser.error('Portable player bundle check failed: ' + detail)
    output.parent.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(p.startswith('.') or p in ('node_modules', '__pycache__') for p in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError('Refusing symlink: ' + str(relative))
        if path.is_file():
            files.append((relative.as_posix(), path.read_bytes()))
    manifest = {
        'schema': 'ludolingua.package-manifest.v1',
        'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in files],
        'limitations': ['Private authored contribution; no model integration or native human playtest certified.'],
    }
    if any(name == 'MANIFEST.json' for name, _ in files):
        raise ValueError('MANIFEST.json is generated; remove pre-existing copy')
    files.append(('MANIFEST.json', (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()))
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in sorted(files):
            info = zipfile.ZipInfo('episode-kit/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    with sidecar.open('x') as stream:
        stream.write(digest + '  ' + output.name + '\n')
    print(json.dumps({'archive': str(output), 'sha256': digest, 'files': len(files)}))


if __name__ == '__main__':
    main()
