# V2 bundled fonts

NULL V2 bundles Inter 4.1 for deterministic editor text shaping and browser preview parity.

Source: `https://github.com/rsms/inter/releases/tag/v4.1`

License: SIL Open Font License 1.1. The unmodified license text is stored in `Inter-OFL.txt`.

| File | SHA-256 |
| --- | --- |
| `InterVariable.ttf` | `4989B125924991B90D05B2D16E0E388C48F7D5BB8B30539BBF9C755278D0CCAF` |
| `InterVariable-Italic.ttf` | `D6F1F6A172D9E588438DB9F986FD5CFAD7B30F644374080A8A9D4D91E344586F` |
| `Inter-OFL.txt` | `262481E844521B326F5ECD053E59B98C8B2DA78C8EE1BDBB6E8174305E54935A` |

The bundled registry currently resolves only the Inter family. Missing families and glyphs stay on the explicitly reported deterministic fallback path; they must not be presented as shaped output.
