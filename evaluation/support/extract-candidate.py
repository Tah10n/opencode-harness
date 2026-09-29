"""Extract an untrusted candidate archive into a new directory, without links."""
import os
import pathlib
import sys
import tarfile

archive, target = sys.argv[1:]
target = pathlib.Path(target)
if not target.is_absolute() or target.exists():
    raise ValueError('new absolute target required')
with tarfile.open(archive, 'r:') as tar:
    members = tar.getmembers()
    seen = set()
    total = 0
    for member in members:
        name = pathlib.PurePosixPath(member.name)
        if name.is_absolute() or '..' in name.parts or '\\' in member.name:
            raise ValueError('unsafe archive path')
        if not (member.isdir() or member.isfile()):
            raise ValueError('links and special files retained in archive but not extracted')
        if str(name) in seen:
            raise ValueError('duplicate archive path')
        seen.add(str(name))
        total += member.size
        if total > 128 * 1024 * 1024:
            raise ValueError('candidate extraction size limit')
    target.mkdir(mode=0o700)
    for member in members:
        destination = target.joinpath(*pathlib.PurePosixPath(member.name).parts)
        if member.isdir():
            destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with destination.open('xb') as output, tar.extractfile(member) as source:
                while True:
                    data = source.read(65536)
                    if not data:
                        break
                    output.write(data)
            os.chmod(destination, 0o700 if member.mode & 0o111 else 0o600)
