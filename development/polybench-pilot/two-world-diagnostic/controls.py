"""Small preparation controls, no new benchmark assertions."""
import io
import tarfile
from driver import check_boundary, validate_target, parse_snapshot


def boundary_controls():
    manifest = {'files': ['test.js'], 'directories': []}
    full = {'prod.js': 'correct', 'test.js': 'author'}
    assert check_boundary(full, {'prod.js': 'correct', 'test.js': 'independent'}, manifest)
    rejected = []
    for name, callback in [
        ('production rollback', lambda: check_boundary(full, {'prod.js': 'baseline', 'test.js': 'independent'}, manifest)),
        ('gold import', lambda: validate_target('/gold/compiler/svelte.js', '/testbed/compiler/svelte.js')),
    ]:
        try:
            callback()
        except RuntimeError:
            rejected.append(name)
        else:
            raise AssertionError('boundary accepted ' + name)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w') as archive:
        for name in ['prod.js', 'z-last.js']:
            item = tarfile.TarInfo(name); item.size = 4; item.mode = 0o644
            archive.addfile(item, io.BytesIO(b'code'))
    paths = ['prod.js', 'author-test.js', 'z-last.js']
    warning = b'tar: author-test.js: Cannot stat: No such file or directory\ntar: Exiting with failure status due to previous errors\n'
    observed = parse_snapshot(buf.getvalue(), warning, 2, paths)
    assert set(observed) == {'prod.js', 'z-last.js'}
    for error in [b'tar: prod.js: Permission denied\n', b'']:
        try:
            parse_snapshot(buf.getvalue(), error, 2, paths)
        except AssertionError:
            pass
        else:
            raise AssertionError('unexpected snapshot diagnostic accepted')
    return {'valid_overlay': True, 'rejected': rejected, 'missing_author_file_preserves_complete_inventory': True, 'unexpected_snapshot_errors_rejected': True}


if __name__ == '__main__':
    print(boundary_controls())
