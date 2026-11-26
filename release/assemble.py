"""Validate the two native release packages and produce public checksums/notes.

Uses only the Python standard library on the GitHub Linux runner.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version):
        raise ValueError("Version must be major.minor.patch")
    if root.joinpath("VERSION").read_text().strip() != args.version:
        raise ValueError("Release version does not match VERSION")
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        raise ValueError("An exact source commit is required")
    checksums = []
    for platform, suffix, binary in [
        ("Windows", "Windows", "App Proxy.exe"),
        ("macOS", "macOS-universal", "App Proxy.app/Contents/Info.plist"),
    ]:
        stem = f"AppProxy-{args.version}-{suffix}"
        package = args.directory / (stem + ".zip")
        with zipfile.ZipFile(package) as archive:
            entries = {name.replace("\\", "/"): name for name in archive.namelist()}
            for filename in [binary, "README.md", "README.zh-CN.md", "LICENSE", "BUILD-INFO.json"]:
                if f"{stem}/{filename}" not in entries:
                    raise ValueError(f"{package.name} is missing {filename}")
            info = json.loads(archive.read(entries[f"{stem}/BUILD-INFO.json"]))
            if (info["version"] != args.version or info["platform"] != platform
                    or info["sourceCommit"] != args.commit or info["sourceDirty"] is not False):
                raise ValueError(f"{package.name} does not identify this clean source commit")
            bad_entry = archive.testzip()
            if bad_entry is not None:
                raise ValueError(f"Corrupt archive member: {bad_entry}")
        digest = hashlib.sha256()
        with package.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        checksums.append(f"{digest.hexdigest()}  {package.name}\n")
    args.directory.joinpath("SHA256SUMS.txt").write_text("".join(checksums), encoding="ascii")
    shutil.copyfile(root / "docs" / "releases" / f"v{args.version}.md", args.directory / "RELEASE_NOTES.md")
    print("Validated both native packages and wrote SHA256SUMS.txt / RELEASE_NOTES.md")


if __name__ == "__main__":
    main()
