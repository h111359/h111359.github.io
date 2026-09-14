#!/bin/sh
# start-editor.sh: Run the local trip editor from any working directory.
# Component: Trip authoring; open a terminal for graphical launches and preserve Python signals.
set -eu

launcher=$(readlink -f -- "$0")

# Files may launch without a terminal. Keep startup errors visible in the new terminal.
if [ ! -t 0 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    terminal_command='"$@"; result=$?; if [ "$result" -ne 0 ]; then printf "Editor failed. Press Enter to close. "; read reply; fi; exit "$result"'
    if command -v gnome-terminal >/dev/null 2>&1; then
        exec gnome-terminal --wait -- /bin/sh -c "$terminal_command" sh "$launcher" "$@"
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
        exec x-terminal-emulator -e /bin/sh -c "$terminal_command" sh "$launcher" "$@"
    fi
    printf '%s\n' 'No terminal found. Open a terminal in trips and run ./start-editor.sh.' >&2
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' 'Install Python 3.10 or newer and retry.' >&2
    exit 1
fi
if ! python3 -B -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    printf '%s\n' 'Python 3.10 or newer is required.' >&2
    exit 1
fi

# Replace the launcher so Ctrl+C and terminal closure reach the helper directly.
exec python3 -B "$(dirname -- "$launcher")/scripts/trip_editor_server.py" "$@"
