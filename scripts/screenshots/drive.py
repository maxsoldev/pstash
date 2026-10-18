"""Drive a real `claude --plugin-dir` session in a pty and snapshot its screen.

Usage: drive.py <steps.json> <out-dir>. Each step: {"keys": str, "type": bool?, "wait": secs, "shot": name?}.
Reads PSTASH_REPO (the plugin checkout) and PSTASH_SHOTS (the work dir with my-app/ and store/).
"""
import json, os, pty, select, sys, time

import pyte

COLS, ROWS = 104, 26
REPO = os.environ['PSTASH_REPO']
WORK = os.environ['PSTASH_SHOTS']
APP = f'{WORK}/my-app'

steps = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)

screen = pyte.Screen(COLS, ROWS)
stream = pyte.ByteStream(screen)
env = dict(os.environ, PSTASH_DIR=f'{WORK}/store', COLUMNS=str(COLS), LINES=str(ROWS), TERM='xterm-256color', COLORTERM='truecolor')
# the child must not think it runs inside this (or another) Claude Code session
for k in [k for k in env if k.startswith(('CLAUDE_CODE_', 'HERDR_')) or k == 'CLAUDECODE']:
    env.pop(k)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(APP)
    import fcntl, struct, termios
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
    os.execvpe('claude', ['claude', '--name', 'my-app', '--plugin-dir', REPO], env)

import fcntl, struct, termios
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))


def pump(secs):
    end = time.time() + secs
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                return
            stream.feed(data)


def snapshot(name):
    rows = []
    for y in range(ROWS):
        line = screen.buffer[y]
        rows.append([[line[x].data, line[x].fg, line[x].bg, line[x].bold, line[x].reverse, line[x].italics] for x in range(COLS)])
    json.dump(rows, open(f'{out}/{name}.json', 'w'))
    open(f'{out}/{name}.txt', 'w').write('\n'.join(screen.display))


pump(10)
for step in steps:
    keys = step.get('keys', '')
    # typed text goes one char at a time; escape sequences in one write
    parts = [keys] if keys.startswith('\x1b') or not step.get('type') else list(keys)
    for part in parts:
        try:
            os.write(fd, part.encode())
        except OSError:
            print('\n'.join(screen.display)); sys.exit('child exited')
        pump(0.015)
    pump(step.get('wait', 1))
    snapshot(step.get('shot', f"step{steps.index(step)}"))
os.kill(pid, 9)
