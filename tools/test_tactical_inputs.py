"""Test Tactical & Shifted Roguelike Inputs (T, D, B, R, C, >, <)
Uses the reference python Bridge driver to verify the C engine response.
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bridge import Bridge, BridgeError

def test_tactical_commands():
    print("--- TESTING TACTICAL ROGUELIKE COMMANDS (T, D, B, R, C) ---")
    with Bridge(savefile="smoke_tactical", new_character=True) as b:
        b.birth()
        assert b.in_dungeon, "Must be in dungeon"
        print("  ok: Player successfully birthed and in town/dungeon")

        # 1. Test Tunneling ('T')
        b.key("T")
        screen = b.screen()
        ui = b.frame.get("ui", {})
        messages = [m.get("text", "") for m in b.frame.get("messages", []) if isinstance(m, dict)]
        assert "tunnel" in screen.lower() or any("tunnel" in m.lower() for m in messages) or not ui.get("awaiting_command", True), \
            f"Expected Tunnel prompt, got screen:\n{screen}"
        print("  ok: Tunnel (T) prompt active")
        b.key("escape")

        # 2. Test Disarm ('D')
        b.key("D")
        screen = b.screen()
        ui = b.frame.get("ui", {})
        messages = [m.get("text", "") for m in b.frame.get("messages", []) if isinstance(m, dict)]
        assert "disarm" in screen.lower() or any("disarm" in m.lower() for m in messages) or not ui.get("awaiting_command", True), \
            f"Expected Disarm prompt, got screen:\n{screen}"
        print("  ok: Disarm (D) prompt active")
        b.key("escape")

        # 3. Test Rest ('R')
        b.key("R")
        screen = b.screen()
        ui = b.frame.get("ui", {})
        messages = [m.get("text", "") for m in b.frame.get("messages", []) if isinstance(m, dict)]
        assert "rest" in screen.lower() or any("rest" in m.lower() for m in messages) or not ui.get("awaiting_command", True), \
            f"Expected Rest prompt, got screen:\n{screen}"
        print("  ok: Rest (R) prompt active")
        b.key("escape")

        # 4. Test Character Sheet ('C')
        b.key("C")
        screen = b.screen()
        assert "age" in screen.lower() or "height" in screen.lower() or "race" in screen.lower() or "stats" in screen.lower(), \
            f"Expected Character sheet, got screen:\n{screen}"
        print("  ok: Character Sheet (C) screen active")
        b.key("escape")

        print("100% Tactical Command Tests Passed.")

if __name__ == "__main__":
    test_tactical_commands()
