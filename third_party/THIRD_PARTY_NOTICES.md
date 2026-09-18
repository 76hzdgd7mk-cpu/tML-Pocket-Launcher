# Third-party sources

The template uses the following pinned sources. Preserve the license files in each source directory when updating them.

| Component | Revision/source |
| --- | --- |
| FNA | `2f5d094a173e9423448d472d5735d13997985f13` from `https://github.com/FNA-XNA/FNA` |
| SDL2 | `a11d64ff44fdeb22af604d7bc1c77e941bfd0d67` from the reference project |
| FNA3D | `2c2907aad90f66dba083ca3689343c1afcf7fb09` from the reference project |
| FAudio | `c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6` from the reference project |
| dotnethost | `3258140fa689a975c8e75ca83e6f9cc88e05f9cf` from the reference project |
| .NET runtime | `10.0.4`, Android arm64 runtime archive from the reference project |

FNA is built from `FNA.NetStandard.csproj` and the game is hosted as a normal IL assembly by CoreCLR. The runtime archive is redistributed only for this template's Android execution path; review upstream licenses before publishing an application built from this repository.
