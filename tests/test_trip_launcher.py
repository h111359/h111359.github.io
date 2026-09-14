"""test_trip_launcher.py: Exercise the executable Linux trip editor entry point.

Component: Trip authoring; verify relocation, argument handling and terminal startup.
All temporary fixtures stay inside the workspace.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'trips/start-editor.sh'


class LauncherTests(unittest.TestCase):
    """Run the actual script without opening the user's browser or terminal."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='.launcher-test-', dir=ROOT)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.env = dict(os.environ, DISPLAY='', WAYLAND_DISPLAY='', PYTHONDONTWRITEBYTECODE='1')

    def run_launcher(self, launcher, *args):
        """Execute from an unrelated directory and capture diagnostics without a TTY."""
        return subprocess.run([str(launcher), *args], cwd='/', env=self.env,
                              stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)

    def test_real_helper_help(self):
        """The executable entry point finds the real helper and forwards options."""
        result = self.run_launcher(LAUNCHER, '--help')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--no-browser', result.stdout)

    def test_relocated_path_and_literal_arguments(self):
        """Spaces, Unicode and shell metacharacters survive relocation and execution."""
        trip = self.root / "път с интервали ' $"
        (trip / 'scripts').mkdir(parents=True)
        launcher = trip / 'start-editor.sh'
        shutil.copy2(LAUNCHER, launcher)
        (trip / 'scripts/trip_editor_server.py').write_text(
            'import json, sys\nprint(json.dumps(sys.argv[1:]))\n')
        args = ['space here', "quote'", '$(never-run)', '--port', '0']
        result = self.run_launcher(launcher, *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), args)

    def test_graphical_launch_gets_terminal(self):
        """A simulated terminal allocates a PTY and runs the helper exactly once."""
        terminal = self.root / 'gnome-terminal'
        terminal.write_text(
            '#!/usr/bin/python3\n'
            'import os, pty, subprocess, sys\n'
            'assert sys.argv[1:3] == ["--wait", "--"]\n'
            'master, slave = pty.openpty()\n'
            'try:\n'
            ' result = subprocess.run(sys.argv[3:], stdin=slave, timeout=5)\n'
            'finally:\n'
            ' os.close(slave); os.close(master)\n'
            'sys.exit(result.returncode)\n')
        terminal.chmod(0o755)
        self.env.update(DISPLAY=':test', PATH=str(self.root) + os.pathsep + os.environ['PATH'])
        result = self.run_launcher(LAUNCHER, '--help')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count('usage:'), 1)

    def test_missing_python(self):
        """A missing interpreter produces an actionable error and failure status."""
        (self.root / 'readlink').symlink_to('/usr/bin/readlink')
        self.env['PATH'] = str(self.root)
        result = self.run_launcher(LAUNCHER)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Install Python 3.10', result.stderr)


if __name__ == '__main__':
    unittest.main()
