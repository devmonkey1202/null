# Android Signing Guide

- App ID: com.null.l2
- Prepare signing keys/certificates and keep them in a secure vault
- Verify entitlements and permission strings before signing
- Run a clean build and sign the release artifact
- Store the signed artifact checksum in release notes
- Re-verify signature after upload (store console or notarization)
