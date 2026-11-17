using System.IO.Compression;
using System.IO.Hashing;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace MobileLauncher.Stores;

internal sealed class GogSession
{
    private static readonly JsonObject Client = JsonNode.Parse(typeof(GogSession).Assembly.GetManifestResourceStream("MobileLauncher.Stores.GogClient.json")!)!.AsObject();
    private readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(60) };
    private string accessToken = "", refreshToken = "", account = "", product = "";
    private DateTimeOffset expires;
    private string Text(string key) => Client[key]!.GetValue<string>();
    public string AuthorizationUrl(string state) => "https://auth.gog.com/auth?client_id=" + Uri.EscapeDataString(Text("clientId")) +
        "&redirect_uri=" + Uri.EscapeDataString(Text("redirectUri")) + "&response_type=code&layout=default&brand=gog&state=" + Uri.EscapeDataString(state);

    public JsonObject Snapshot(bool credentials = false)
    {
        var result = new JsonObject
        {
            ["phase"] = accessToken.Length == 0 ? "signedOut" : "ready",
            ["account"] = account,
            ["owned"] = product.Length > 0,
            ["message"] = accessToken.Length == 0 ? "尚未登录" : product.Length > 0 ? "已拥有 Terraria，可以下载资源" : "登录成功，游戏库中没有 Terraria"
        };
        if (credentials && refreshToken.Length > 0) result["credentials"] = new JsonObject { ["refreshToken"] = refreshToken };
        return result;
    }

    public async Task LoginAsync(string value, bool refresh, CancellationToken ct)
    {
        var query = new Dictionary<string, string>
        {
            ["client_id"] = Text("clientId"),
            ["client_secret"] = Text("clientSecret"),
            ["grant_type"] = refresh ? "refresh_token" : "authorization_code",
            [refresh ? "refresh_token" : "code"] = value,
            ["redirect_uri"] = Text("redirectUri")
        };
        using var content = new FormUrlEncodedContent(query);
        // GOG's installed-client token endpoint accepts query parameters, as in the reference.
        var token = await JsonAsync("https://auth.gog.com/token?" + await content.ReadAsStringAsync(ct), false, ct);
        var newAccess = token["access_token"]?.GetValue<string>() ?? throw new IOException("GOG 未返回登录令牌");
        accessToken = newAccess; refreshToken = token["refresh_token"]?.GetValue<string>() ?? value;
        expires = DateTimeOffset.UtcNow.AddSeconds(token["expires_in"]?.GetValue<int>() ?? 3600);
        var user = await JsonAsync("https://embed.gog.com/userData.json", true, ct);
        account = user["username"]?.GetValue<string>() ?? "GOG";
        try { await CheckOwnedAsync(ct); }
        catch { Logout(); throw; }
    }

    private async Task EnsureTokenAsync(CancellationToken ct)
    {
        if (accessToken.Length == 0) throw new InvalidOperationException("请先登录 GOG");
        if (expires < DateTimeOffset.UtcNow.AddMinutes(1)) await LoginAsync(refreshToken, true, ct);
    }

    private async Task CheckOwnedAsync(CancellationToken ct)
    {
        product = "";
        for (var page = 1; page <= 100; page++)
        {
            var library = await JsonAsync($"https://embed.gog.com/account/getFilteredProducts?mediaType=1&search=terraria&page={page}", true, ct);
            foreach (var game in library["products"]?.AsArray() ?? [])
                if (string.Equals(game?["title"]?.GetValue<string>(), "Terraria", StringComparison.OrdinalIgnoreCase))
                    product = game!["id"]!.ToString();
            if (page >= (library["totalPages"]?.GetValue<int>() ?? 1)) break;
        }
    }

    public async Task<JsonArray> InstallersAsync(CancellationToken ct)
    {
        await EnsureTokenAsync(ct);
        await CheckOwnedAsync(ct);
        if (product.Length == 0) throw new InvalidOperationException("当前 GOG 账户未拥有 Terraria");
        var details = await JsonAsync($"https://api.gog.com/products/{product}?expand=downloads", true, ct);
        var installers = new JsonArray();
        foreach (var item in details["downloads"]?["installers"]?.AsArray() ?? [])
        {
            if (item?["os"]?.GetValue<string>() != "linux") continue;
            var files = item["files"]?.AsArray();
            // Do not silently discard a second part of a multipart installer.
            if (files?.Count != 1) continue;
            installers.Add(new JsonObject
            {
                ["id"] = item["id"]!.ToString(),
                ["name"] = item["name"]?.ToString() ?? "Terraria Linux",
                ["version"] = item["version"]?.ToString() ?? "",
                ["language"] = item["language"]?.ToString() ?? "en",
                ["size"] = files[0]?["size"]?.DeepClone() ?? JsonValue.Create(0),
                ["downlink"] = files[0]?["downlink"]?.DeepClone()
            });
        }
        if (installers.Count == 0) throw new IOException("GOG 未返回可下载的单文件 Linux 安装包");
        return installers;
    }

    public async Task<string> DownloadAsync(string id, string root, Action<string, int> progress, CancellationToken ct)
    {
        var installers = await InstallersAsync(ct);
        var installer = installers.FirstOrDefault(n => n?["id"]?.ToString() == id) ?? throw new ArgumentException("所选 GOG 版本已失效，请刷新列表");
        var downlinkUrl = installer["downlink"]?.GetValue<string>() ?? throw new IOException("GOG 未返回下载链接");
        var link = await JsonAsync(downlinkUrl, true, ct);
        var url = link["downlink"]?.GetValue<string>() ?? throw new IOException("GOG 下载授权失败");
        var directory = Path.Combine(root, "gog-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var downloaded = directory + ".sh";
        var payload = directory + ".payload";
        try
        {
            await DownloadFileAsync(url, downloaded, installer["size"]?.GetValue<long>() ?? 0, progress, ct);
            progress("GOG：正在提取游戏资源…", 80);
            await ExtractInstallerAsync(downloaded, payload, directory, ct);
            await StoreFiles.PreserveVersionAsync(directory, installer["version"]?.ToString(), ct);
            progress("GOG：资源已提取，正在校验…", 90);
            return await StoreFiles.PackageAsync(directory, ct);
        }
        finally
        {
            File.Delete(downloaded); File.Delete(payload); Directory.Delete(directory, true);
        }
    }

    private async Task DownloadFileAsync(string address, string path, long expected, Action<string, int> progress, CancellationToken ct)
    {
        using var response = await SendAsync(address, false, ct);
        var total = response.Content.Headers.ContentLength ?? expected;
        if (total is <= 0 or > 8L * 1024 * 1024 * 1024) throw new IOException("GOG 下载包大小无效");
        await using var input = await response.Content.ReadAsStreamAsync(ct);
        await using var output = File.Create(path);
        var buffer = new byte[128 * 1024];
        long done = 0;
        while (true)
        {
            var count = await input.ReadAsync(buffer, ct);
            if (count == 0) break;
            done += count;
            if (done > total) throw new IOException("GOG 响应长度超出下载清单");
            await output.WriteAsync(buffer.AsMemory(0, count), ct);
            progress($"GOG：下载资源 {done / 1048576}/{total / 1048576} MB", (int)(done * 75 / total));
        }
        if (done != total || (expected > 0 && done != expected)) throw new IOException("GOG 下载文件不完整，请重试");
    }

    // GOG Linux makeself bundles contain an appended ZIP after the MojoSetup payload.
    public static async Task<string> ImportAsync(string root, string name, Action<string, int> progress, CancellationToken ct)
    {
        // The native picker copies input here; RPC cannot select arbitrary local files.
        if (Path.GetFileName(name) != name || !name.StartsWith("import-", StringComparison.Ordinal) || !name.EndsWith(".sh", StringComparison.Ordinal))
            throw new ArgumentException("GOG 导入路径无效");
        var input = Path.Combine(root, name);
        var size = new FileInfo(input).Length;
        if (size is <= 0 or > 8L * 1024 * 1024 * 1024) throw new InvalidDataException("GOG 安装包大小无效");
        var directory = Path.Combine(root, "gog-import-" + Guid.NewGuid().ToString("N"));
        var payload = directory + ".payload";
        Directory.CreateDirectory(directory);
        try
        {
            progress("GOG：正在提取本地安装包…", 10);
            await ExtractInstallerAsync(input, payload, directory, ct);
            progress("GOG：正在校验资源…", 90);
            return await StoreFiles.PackageAsync(directory, ct);
        }
        finally { File.Delete(payload); Directory.Delete(directory, true); }
    }

    // Parse lengths as data; never invoke sh or execute anything in the installer.
    public static async Task ExtractInstallerAsync(string installer, string payload, string root, CancellationToken ct)
    {
        await using var source = File.OpenRead(installer);
        var header = new byte[Math.Min(source.Length, 1024 * 1024)];
        await source.ReadExactlyAsync(header, ct);
        var text = Encoding.Latin1.GetString(header);
        if (!(text.StartsWith("#!/bin/sh\n", StringComparison.Ordinal) || text.StartsWith("#!/bin/bash\n", StringComparison.Ordinal)))
            throw new InvalidDataException("请选择 GOG Linux .sh 离线安装包，不能将 ZIP 改名后导入");
        var linesMatch = Regex.Match(text, @"head -n\s+(\d+)", RegexOptions.CultureInvariant);
        if (!linesMatch.Success) linesMatch = Regex.Match(text, @"(?m)^(?:SKIP|skip)=[""']?(\d+)");
        var sizeMatch = Regex.Match(text, @"(?m)^(?:filesizes|SIZE)=[""']?(\d+)");
        if (!linesMatch.Success || !sizeMatch.Success) throw new InvalidDataException("无法识别 GOG Linux 安装包头部");
        var lineCount = int.Parse(linesMatch.Groups[1].Value);
        if (lineCount <= 0 || lineCount > header.Length) throw new InvalidDataException("GOG 安装包行数无效");
        var offset = 0;
        for (var line = 0; line < lineCount; line++)
        {
            var next = Array.IndexOf(header, (byte)'\n', offset);
            if (next < 0) throw new InvalidDataException("GOG 安装包头部被截断");
            offset = next + 1;
        }
        var start = checked(offset + long.Parse(sizeMatch.Groups[1].Value));
        if (start < offset || start >= source.Length) throw new InvalidDataException("GOG 安装包数据偏移无效");
        source.Position = start;
        await using (var zipOutput = File.Create(payload)) await source.CopyToAsync(zipOutput, ct);
        using var zip = ZipFile.OpenRead(payload);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        foreach (var entry in zip.Entries)
        {
            ct.ThrowIfCancellationRequested();
            var path = StoreFiles.ContentPath(entry.FullName) ?? StoreFiles.VersionProbePath(entry.FullName);
            if (path == null || entry.FullName.EndsWith('/')) continue;
            if (path.StartsWith("_version/", StringComparison.Ordinal) &&
                entry.Length > (path.EndsWith("/gameinfo", StringComparison.Ordinal) ? 20480 : 64 * 1024 * 1024))
                throw new InvalidDataException("GOG 版本信息过大");
            if ((entry.ExternalAttributes >> 16 & 0xF000) == 0xA000) throw new InvalidDataException("GOG 资源包含符号链接");
            total = checked(total + entry.Length);
            if (total > 8L * 1024 * 1024 * 1024 || !seen.Add(path)) throw new InvalidDataException("GOG 资源过大或存在重复路径");
            var destination = StoreFiles.Target(root, path);
            await using var input = entry.Open();
            await using var output = File.Create(destination);
            var checksum = new Crc32();
            var buffer = new byte[128 * 1024];
            while (true)
            {
                var count = await input.ReadAsync(buffer, ct);
                if (count == 0) break;
                checksum.Append(buffer.AsSpan(0, count));
                await output.WriteAsync(buffer.AsMemory(0, count), ct);
                if (output.Length > entry.Length) throw new InvalidDataException("GOG 资源长度超出清单");
            }
            if (output.Length != entry.Length) throw new InvalidDataException("GOG 资源长度校验失败");
            if (checksum.GetCurrentHashAsUInt32() != entry.Crc32) throw new InvalidDataException("GOG 资源 CRC 校验失败");
        }
        await StoreFiles.PreserveVersionAsync(root, null, ct);
    }

    private async Task<JsonObject> JsonAsync(string url, bool auth, CancellationToken ct)
    {
        using var response = await SendAsync(url, auth, ct);
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        if (bytes.Length > 16 * 1024 * 1024) throw new IOException("GOG 元数据过大");
        return JsonNode.Parse(bytes)?.AsObject() ?? throw new IOException("GOG 返回了无效数据");
    }

    private async Task<HttpResponseMessage> SendAsync(string address, bool auth, CancellationToken ct)
    {
        for (var redirects = 0; redirects < 10; redirects++)
        {
            var uri = new Uri(address);
            if (uri.Scheme != "https" || !(Allowed(uri.Host, "gog.com") || Allowed(uri.Host, "gog-statics.com") || Allowed(uri.Host, "gogcdn.net")))
                throw new IOException("GOG 返回了非官方 HTTPS 地址");
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            // Never forward a bearer token to download CDNs or across origins.
            if (auth && uri.Host is "embed.gog.com" or "api.gog.com" or "auth.gog.com")
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.UserAgent.ParseAdd("tModLoaderMobileLauncher/0.1.1");
            var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location)
            {
                address = new Uri(uri, location).AbsoluteUri; response.Dispose(); continue;
            }
            if (!response.IsSuccessStatusCode)
            {
                var status = (int)response.StatusCode; response.Dispose();
                throw new IOException($"GOG 请求失败（HTTP {status}），请重新登录或稍后重试");
            }
            return response;
        }
        throw new IOException("GOG 重定向次数过多");
    }
    private static bool Allowed(string host, string domain) => host == domain || host.EndsWith("." + domain, StringComparison.Ordinal);
    public void Logout() { accessToken = ""; refreshToken = ""; account = ""; product = ""; }
}
