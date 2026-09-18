# Third-party sources

The template uses the following pinned Git submodules. Preserve the license
files in each source directory when updating them.

| Component | Revision/source |
| --- | --- |
| FNA | `external/FNA`, `45df1c8db64a92ec538cc9a8f64522044867d793`, `https://github.com/FNA-XNA/FNA` |
| SDL2 | `external/SDL`, `a11d64ff44fdeb22af604d7bc1c77e941bfd0d67`, `https://github.com/RotatingArtDev/SDL` |
| FNA3D | `external/FNA3D`, `2c2907aad90f66dba083ca3689343c1afcf7fb09`, `https://github.com/RotatingArtDev/FNA3D` |
| FAudio | `external/FAudio`, `c370ada0eedcab8d9c270b5c5fc2274f4e7f3ec6`, `https://github.com/RotatingArtDev/FAudio` |
| dotnethost | `platforms/android/native/dotnethost`, template-owned hostfxr adapter |
| .NET runtime | `10.0.4`, Android arm64 runtime archive from the reference project |

FNA is built from `FNA.NetStandard.csproj` and the game is hosted as a normal IL assembly by CoreCLR. The runtime archive is redistributed only for this template's Android execution path; review upstream licenses before publishing an application built from this repository.
