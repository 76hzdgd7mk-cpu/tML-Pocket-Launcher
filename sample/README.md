# FNA sample

This is a normal `net10.0` IL assembly. It references the pinned FNA `netstandard2.0` source project and is loaded by the Android template's .NET 10 CoreCLR host.

Build it from the repository root:

```powershell
dotnet build sample/FnaSample.csproj -c Release
dotnet publish sample/FnaSample.csproj -c Release -r linux-arm64 --self-contained false
```
