# V2 editor fonts

NULL V2 loads Inter 4.1, Noto Sans Hebrew, and Noto Sans Arabic from these public assets during editor bridge startup. The browser and Rust text kernel therefore shape against the same files without duplicating font bytes inside the WASM binary.

Sources:

- `https://github.com/rsms/inter/releases/tag/v4.1`
- `https://github.com/google/fonts/tree/main/ofl/notosanshebrew`
- `https://github.com/google/fonts/tree/main/ofl/notosansarabic`

License: SIL Open Font License 1.1. The unmodified license texts are stored beside the font files.

| File | SHA-256 |
| --- | --- |
| `InterVariable.ttf` | `4989B125924991B90D05B2D16E0E388C48F7D5BB8B30539BBF9C755278D0CCAF` |
| `InterVariable-Italic.ttf` | `D6F1F6A172D9E588438DB9F986FD5CFAD7B30F644374080A8A9D4D91E344586F` |
| `Inter-OFL.txt` | `262481E844521B326F5ECD053E59B98C8B2DA78C8EE1BDBB6E8174305E54935A` |
| `NotoSansHebrew-Variable.ttf` | `7EF36A2C3593758CDB622E1BDEF4F84523E92FBC3CCC667438DD80FF54C2DE88` |
| `OFL-NotoSansHebrew.txt` | `9B9FE028B5BA74D231659A1BBAF0ED09B11E759D1CA6A070999E16D151616B47` |
| `NotoSansArabic-Variable.ttf` | `63111B5B2E074DD48CC67692E0A2726D86EE94C1C37FE8598257B7B4E87E869E` |
| `OFL-NotoSansArabic.txt` | `07FC70BFEB985CC1A87A8587D0A0C80BAB11C86C9DC3FD95B6F0CB332F983E96` |

The dynamic registry validates OpenType data before registration and limits each face to 16 MiB, the registry to 32 faces, and total registered bytes to 32 MiB. Missing or failed script assets stay on the explicitly reported deterministic fallback path; they must not be presented as shaped output. End-user font upload, persistence, and project-level font manifests are separate unfinished work.
