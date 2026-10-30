#!/usr/bin/env python3
"""Bundle Mapmaker's Cabinet with the byte-pinned existing runtime; stdlib only."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile
import zipfile

def digest(data):
    return hashlib.sha256(data).hexdigest()

def inventory(root):
    result = {}
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(x.startswith(".") or x in ("node_modules", "__pycache__") for x in rel.parts):
            continue
        if p.is_symlink():
            raise ValueError("Refusing symlink: " + str(p))
        if p.is_file():
            result[rel.as_posix()] = p.read_bytes()
    return result

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def verify_exports(root):
    expected = {
        'episodes/01-en-source.json', 'episodes/02-es-literal-contrast.json',
        'episodes/03-es-adapted.json', 'comparisons/source-vs-literal.json',
        'comparisons/source-vs-adapted.json', 'players/01-en-source.html',
        'players/03-es-adapted.html',
    }
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('id') != 'mapmakers-cabinet':
        raise ValueError('Wrong authored pack ID')
    if manifest['runtime']['commit'] != 'c2f0637374cd8f33efbf3a085f9a6388a69194be':
        raise ValueError('Wrong runtime commit')
    rows = manifest['files']
    paths = [row['path'] for row in rows]
    if len(paths) != len(set(paths)) or set(paths) != expected:
        raise ValueError('Export manifest membership mismatch')
    actual = set()
    for item in root.rglob('*'):
        if item.is_symlink():
            raise ValueError('Symlink in authored exports')
        if item.is_file():
            actual.add(item.relative_to(root).as_posix())
    if actual != expected | {'manifest.json'}:
        raise ValueError('Export directory membership mismatch')
    for row in rows:
        data = (root / row['path']).read_bytes()
        if len(data) != row['bytes'] or digest(data) != row['sha256']:
            raise ValueError('Export integrity mismatch: ' + row['path'])
    players = manifest.get('players', [])
    if len(players) != 2 or {row['file'] for row in players} != {
        'players/01-en-source.html', 'players/03-es-adapted.html'
    }:
        raise ValueError('Portable player manifest mismatch')
    return manifest

def main():
    pack = Path(__file__).resolve().parent
    root = pack.parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-commit", required=True, help="Exact verified source commit containing this casepack")
    args = parser.parse_args()
    output = args.output.resolve()
    sidecar = output.with_name(output.name + ".sha256")
    if output.is_relative_to(root):
        parser.error("Write the bundle outside its source tree")
    if output.exists() or sidecar.exists():
        parser.error("Both output paths must be new")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_commit):
        parser.error("--source-commit must be a complete Git commit SHA")
    pin = json.loads((pack / "runtime-pin.json").read_text())
    verify_exports(pack / "exports")
    current = inventory(root / "episode-kit")
    expected = {row["path"]: row for row in pin["files"]}
    if set(current) - {"MANIFEST.json"} != set(expected):
        raise ValueError("Runtime file membership differs from its pinned source")
    for name, row in expected.items():
        data = current[name]
        if len(data) != row["bytes"] or digest(data) != row["sha256"]:
            raise ValueError("Runtime bytes changed: " + name)
    if "MANIFEST.json" in current:
        inner = json.loads(current["MANIFEST.json"])
        if {r["path"]: r for r in inner["files"]} != expected:
            raise ValueError("Existing runtime manifest does not match the pin")
    with tempfile.TemporaryDirectory(prefix="mapmakers-cabinet-package-") as temp:
        temp = Path(temp)
        regenerated = temp / "regenerated"
        subprocess.run(["node", str(pack / "build.mjs"), str(regenerated)], check=True, capture_output=True)
        verify_exports(regenerated)
        if inventory(regenerated) != inventory(pack / "exports"):
            raise ValueError("Committed exports differ from freshly checked exports")
        staged_kit = temp / "episode-kit"
        for name in expected:
            dest = staged_kit / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(current[name])
        runtime_zip = temp / "runtime.zip"
        subprocess.run(["python3", str(staged_kit / "scripts/package.py"), "--output", str(runtime_zip)], check=True, capture_output=True)
        with zipfile.ZipFile(runtime_zip) as archive:
            if archive.testzip() is not None:
                raise ValueError("Runtime archive CRC failure")
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise ValueError("Duplicate runtime archive member")
            for name in names:
                parsed = PurePosixPath(name)
                if parsed.is_absolute() or ".." in parsed.parts or not name.startswith("episode-kit/"):
                    raise ValueError("Unexpected runtime archive path: " + name)
            files = {name: archive.read(name) for name in names}
        for name, data in inventory(pack).items():
            files["episode-packs/mapmakers-cabinet/" + name] = data
        files["START_HERE.md"] = (pack / "START_HERE.md").read_bytes()
        landing = (pack / "OPEN_ME.html").read_text(encoding="utf-8")
        files["PLAY.html"] = landing.replace('href="exports/', 'href="episode-packs/mapmakers-cabinet/exports/').replace('href="README.md"', 'href="episode-packs/mapmakers-cabinet/README.md"').encode("utf-8")
        files["BUNDLE-SOURCE.json"] = json_bytes({
            "schema": "ludolingua.authored-casepack-source.v1",
            "casepack": "mapmakers-cabinet", "version": "0.1.0",
            "casepackSourceCommit": args.source_commit,
            "runtime": pin,
            "limitations": [
                "Source commit identity is supplied by the builder; verify it against the repository.",
                "Content hashes are not signatures or attestations of human participation.",
                "Authored examples; no native-language human assessment or automatic repair certified."
            ]
        })
        files["BUNDLE-MANIFEST.json"] = json_bytes({
            "schema": "ludolingua.authored-casepack-package.v1",
            "files": [{"path": name, "bytes": len(data), "sha256": digest(data)} for name, data in sorted(files.items())]
        })
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        sha = digest(output.read_bytes())
        with sidecar.open("x") as stream:
            stream.write(sha + "  " + output.name + "\n")
        print(json.dumps({"archive": str(output), "sha256": sha, "members": len(files), "runtimeSource": pin["commit"], "casepackSource": args.source_commit}))

if __name__ == "__main__":
    main()
