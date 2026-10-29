#!/usr/bin/env python3
"""Package the pinned episode kit and Courier's Rendezvous case."""
import argparse, hashlib, json, re, subprocess, sys, tempfile, zipfile
from pathlib import Path, PurePosixPath

UPSTREAM_COMMIT = "18fdb3eb5fc5c1d8d24efb698eff72bc127f72a4"
UPSTREAM_TREE = "827e4ceb4d959347daab857bb38eab73715c65c9"
CASE_PREFIX = "episode-packs/couriers-rendezvous"
GUIDE = CASE_PREFIX + "/GUIDE.md"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+"\n").encode()

def safe_name(name):
    parts = PurePosixPath(name).parts
    if (not name or "\\" in name or "\0" in name or name.startswith("/")
        or not parts or any(p in ("", ".", "..") for p in name.split("/"))
        or str(PurePosixPath(name)) != name or ":" in parts[0]):
        raise ValueError("Unsafe archive path: "+repr(name))
    return name

def main():
    script=Path(__file__).resolve()
    repo,case=script.parents[3],script.parents[1]
    kit=repo/"episode-kit"
    if case.relative_to(repo).as_posix()!=CASE_PREFIX:
        raise ValueError("Unexpected case-script location")
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--source-commit",required=True)
    args=parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}",args.source_commit):
        parser.error("--source-commit must be a full lowercase Git commit SHA")
    requested=args.output.absolute()
    if requested.is_symlink(): parser.error("Output must not be a symlink")
    output=requested.resolve()
    if output==repo or repo in output.parents: parser.error("Output must be outside the repository")
    sidecar=output.with_name(output.name+".sha256")
    if output.exists() or sidecar.exists() or sidecar.is_symlink():
        parser.error("Archive and sidecar must both be new paths")
    if not (case/"GUIDE.md").is_file(): parser.error("The case GUIDE.md is required")
    # Refuse an accidentally changed runtime before invoking its maintained builder.
    pins=json.loads((case/"runtime-files.json").read_text())
    if pins["commit"]!=UPSTREAM_COMMIT or pins["tree"]!=UPSTREAM_TREE:
        raise ValueError("Unexpected runtime pin")
    expected={}
    for entry in pins["files"]:
        name=safe_name(entry["path"])
        if not name.startswith("episode-kit/") or name in expected:
            raise ValueError("Invalid runtime inventory")
        expected[name]=entry
    actual={}
    for path in kit.rglob("*"):
        if path.is_symlink(): raise ValueError("Refusing runtime symlink: "+str(path))
        if path.is_file():
            name=path.relative_to(repo).as_posix()
            if name=="episode-kit/MANIFEST.json":
                raise ValueError("Build from source, not a previously extracted package")
            actual[name]=path.read_bytes()
    if set(actual)!=set(expected): raise ValueError("Runtime file inventory differs from pin")
    for name,data in actual.items():
        if len(data)!=expected[name]["bytes"] or digest(data)!=expected[name]["sha256"]:
            raise ValueError("Changed runtime file: "+name)
    payload={}
    def add(name,data,info=None):
        safe_name(name)
        if name in payload: raise ValueError("Duplicate archive path: "+name)
        payload[name]=(data,info)
    with tempfile.TemporaryDirectory(prefix="ludolingua-courier-build-") as tmp:
        temporary=Path(tmp).resolve()
        if temporary==repo or repo in temporary.parents:
            raise ValueError("Temporary directory must be outside repository")
        kit_zip=temporary/"kit.zip"
        subprocess.run([sys.executable,str(kit/"scripts/package.py"),"--output",str(kit_zip)],cwd=kit,check=True)
        with zipfile.ZipFile(kit_zip) as archive:
            for info in archive.infolist():
                name=safe_name(info.filename)
                if not name.startswith("episode-kit/") or info.is_dir() or ((info.external_attr>>16)&0o170000)!=0o100000:
                    raise ValueError("Unexpected kit entry: "+name)
                add(name,archive.read(info),info)
    manifest_name="episode-kit/MANIFEST.json"
    if manifest_name not in payload: raise ValueError("Maintained kit manifest missing")
    kit_manifest=json.loads(payload[manifest_name][0])
    expected_kit=set()
    for entry in kit_manifest["files"]:
        name="episode-kit/"+safe_name(entry["path"])
        if name in expected_kit or name==manifest_name: raise ValueError("Invalid kit manifest")
        expected_kit.add(name)
        if name not in payload: raise ValueError("Missing kit file: "+name)
        data=payload[name][0]
        if len(data)!=entry["bytes"] or digest(data)!=entry["sha256"]:
            raise ValueError("Kit manifest mismatch: "+name)
    if set(payload)!=expected_kit|{manifest_name}:
        raise ValueError("Kit manifest does not enumerate exact kit contents")
    def collect(directory):
        for item in sorted(directory.iterdir(),key=lambda x:x.name):
            if item.is_symlink(): raise ValueError("Refusing case symlink: "+str(item))
            if item.name.startswith(".") or item.name=="__pycache__": continue
            if item.is_dir(): collect(item)
            elif item.is_file(): add(item.relative_to(repo).as_posix(),item.read_bytes())
            else: raise ValueError("Non-regular case path: "+str(item))
    collect(case)
    add("README.txt",(
        "LUDOLINGUA — The Courier's Rendezvous private review bundle\n\n"
        "Start with "+GUIDE+".\n"
        "Requires Node.js 22 or newer. From this bundle directory, run:\n"
        "  node episode-kit/serve.mjs\n"
        "Open the printed loopback URL; add /web/playtest.html for the player.\n"
        "Choose a checked case export with the player's file picker.\n"
        "Do not open HTML directly as a file URL. Download play records before closing.\n"
        "Keep generated outputs outside the bundle.\n"
        "The unchanged runtime instructions are in episode-kit/README.md.\n"
        "BUNDLE-MANIFEST.json carries exact content hashes and source references.\n"
    ).encode())
    manifest={"schema":"ludolingua.couriers-rendezvous-bundle.v1","guide":GUIDE,
        "sourceCommit":args.source_commit,"sourceIdentityBasis":"Caller-supplied published case commit; separately verified at release",
        "upstream":{"commit":UPSTREAM_COMMIT,"tree":UPSTREAM_TREE,"manifest":manifest_name},
        "files":[{"path":n,"bytes":len(b),"sha256":digest(b)} for n,(b,_) in sorted(payload.items())],
        "limitations":["Hashes establish content consistency, not signatures.","Mechanical preservation does not certify semantic equivalence.","No provider inference or native-human playtest certified."]}
    add("BUNDLE-MANIFEST.json",json_bytes(manifest))
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,(data,original_info) in sorted(payload.items()):
            info=original_info
            if info is None:
                info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16
            archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
    archive_hash=digest(output.read_bytes())
    with sidecar.open("x",encoding="utf-8",newline="\n") as stream:
        stream.write(archive_hash+"  "+output.name+"\n")
    print(json.dumps({"archive":str(output),"sha256":archive_hash,"files":len(payload),"sourceCommit":args.source_commit,"guide":GUIDE},sort_keys=True))

if __name__=="__main__": main()
